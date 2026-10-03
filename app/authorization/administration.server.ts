import { hasTrustedOrigin } from "../auth/auth.server";
import { getAccess, requirePrimary } from "./permissions.server";
import { roles } from "./roles";

export async function listAccounts(env: Env) {
  // Only called after requirePrimary; no membership/house fields in this list.
  const results = await env.DB.batch<Record<string, unknown>>([
    env.DB.prepare("SELECT id, email FROM user WHERE email_verified = 1 ORDER BY email"),
    env.DB.prepare("SELECT user_id, role FROM role_assignment ORDER BY role"),
  ]);
  return results[0].results.map((row) => ({
    id: row.id as string,
    email: row.email as string,
    roles: results[1].results
      .filter((assignment) => assignment.user_id === row.id)
      .map((assignment) => assignment.role as string),
  }));
}

export async function readAudit(env: Env, before?: string | null) {
  if (before && !/^\d{4}-\d{2}-\d{2}T.*Z\|[a-f0-9]{32}$/.test(before))
    throw new Response("Kursor tidak valid.", { status: 400 });
  const [time, id] = before?.split("|") ?? [null, null];
  const rows = await env.DB.prepare(
    `SELECT id, actor_user_id AS actorUserId, target_user_id AS targetUserId,
    action, role, house, operator, reason, occurred_at AS occurredAt FROM authorization_audit
    WHERE ? IS NULL OR occurred_at < ? OR (occurred_at = ? AND id < ?)
    ORDER BY occurred_at DESC, id DESC LIMIT 101`
  )
    .bind(time, time, time, id)
    .all<{
      id: string;
      actorUserId: string;
      targetUserId: string;
      action: string;
      role: string | null;
      house: string | null;
      operator: string | null;
      reason: string;
      occurredAt: string;
    }>();
  const events = rows.results.slice(0, 100);
  const last = events.at(-1);
  return {
    events,
    nextCursor: rows.results.length > 100 && last ? `${last.occurredAt}|${last.id}` : null,
  };
}

export async function changeRole(request: Request, env: Env, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await requirePrimary(request, env);
  if (!input || typeof input !== "object")
    throw new Response("Permintaan tidak valid.", { status: 400 });
  const { targetUserId, role, action, reason } = input as Record<string, unknown>;
  if (
    typeof targetUserId !== "string" ||
    !targetUserId ||
    targetUserId.length > 200 ||
    typeof role !== "string" ||
    !roles.some((value) => value === role) ||
    (action !== "grant" && action !== "revoke") ||
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.length > 1000
  ) {
    throw new Response(
      "Pilih akun dan peran yang valid serta isi alasan (maksimal 1.000 karakter).",
      { status: 400 }
    );
  }
  const target = await env.DB.prepare("SELECT id FROM user WHERE id = ? AND email_verified = 1")
    .bind(targetUserId)
    .first();
  if (!target) throw new Response("Akun terverifikasi tidak ditemukan.", { status: 400 });
  // Conditional audit insert checks authorization and current state at write time.
  // Its trigger applies the assignment atomically; retries cannot duplicate history.
  const result = await env.DB.prepare(
    `INSERT INTO authorization_audit (id,actor_user_id,target_user_id,action,role,reason)
    SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM organization_bootstrap WHERE primary_user_id = ?)
    AND EXISTS (SELECT 1 FROM user WHERE id = ? AND email_verified = 1)
    AND (? = 'grant' AND NOT EXISTS (SELECT 1 FROM role_assignment WHERE user_id = ? AND role = ?)
      OR ? = 'revoke' AND EXISTS (SELECT 1 FROM role_assignment WHERE user_id = ? AND role = ?))`
  )
    .bind(
      crypto.randomUUID().replaceAll("-", ""),
      account.id,
      targetUserId,
      action,
      role,
      reason.trim(),
      account.id,
      targetUserId,
      action,
      targetUserId,
      role,
      action,
      targetUserId,
      role
    )
    .run();
  return { changed: result.meta.changes > 0 };
}

export async function handleAuthorization(request: Request, env: Env) {
  const url = new URL(request.url);
  if (!["/api/access", "/api/admin/roles", "/api/admin/audit"].includes(url.pathname))
    return new Response(null, { status: 404 });
  try {
    let response: Response;
    if (url.pathname === "/api/access") {
      if (request.method !== "GET") return new Response(null, { status: 405 });
      response = Response.json(await getAccess(request, env));
    } else if (url.pathname === "/api/admin/roles" && request.method === "POST") {
      response = Response.json(
        await changeRole(request, env, await request.json().catch(() => null))
      );
    } else {
      if (request.method !== "GET") return new Response(null, { status: 405 });
      await requirePrimary(request, env);
      response = Response.json(
        url.pathname === "/api/admin/roles"
          ? { accounts: await listAccounts(env) }
          : await readAudit(env, url.searchParams.get("before"))
      );
    }
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (!(error instanceof Response)) throw error;
    error.headers.set("Cache-Control", "no-store");
    return error;
  }
}
