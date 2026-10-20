import { administrationRepository } from "../db/administration.repository.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import { requirePrimary } from "./permissions.server";
import { parseInput, roleInput, representativeNameInput, auditCursor } from "../http/validation";

export async function listAccounts(env: Env) {
  // Only called after requirePrimary; no membership/house fields in this list.
  return administrationRepository(env.DB).accounts();
}

export async function readAudit(env: Env, before?: string | null) {
  if (before) parseInput(auditCursor, before, "Kursor tidak valid.");
  const [time, id] = before?.split("|") ?? [null, null];
  const rows = await administrationRepository(env.DB).audit({ time, id: id });
  const events = rows.slice(0, 100);
  const last = events.at(-1);
  return {
    events,
    nextCursor: rows.length > 100 && last ? `${last.occurredAt}|${last.id}` : null,
  };
}

export async function changeRole(request: Request, env: Env, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await requirePrimary(request, env);
  const { targetUserId, role, action, reason } = parseInput(
    roleInput,
    input,
    "Pilih akun dan peran yang valid serta isi alasan (maksimal 1.000 karakter)."
  );
  const target = await administrationRepository(env.DB).verifiedAccount({ userId: targetUserId });
  if (!target) throw new Response("Akun terverifikasi tidak ditemukan.", { status: 400 });
  // Conditional audit insert checks authorization and current state at write time.
  // Its trigger applies the assignment atomically; retries cannot duplicate history.
  const result = await administrationRepository(env.DB).changeRole({
    id: crypto.randomUUID().replaceAll("-", ""),
    actorId: account.id,
    targetId: targetUserId,
    action,
    role,
    reason: reason.trim(),
  });
  return { changed: result };
}

export async function setRepresentativeName(request: Request, env: Env, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await requirePrimary(request, env);
  const { targetUserId, representativeName } = parseInput(
    representativeNameInput,
    input,
    "Isi nama perwakilan yang valid (1-200 karakter)."
  );
  const repository = administrationRepository(env.DB);
  // The conditional insert rechecks primary authority and current target eligibility.
  const changed = await repository.changeRepresentativeName({
    id: crypto.randomUUID().replaceAll("-", ""),
    actorId: account.id,
    targetId: targetUserId,
    name: representativeName,
  });
  if (changed) return { changed: true };
  const target = await repository.representativeAccount({ userId: targetUserId });
  if (!target) throw new Response("Akun terverifikasi tidak ditemukan.", { status: 400 });
  if (target.representative !== 1)
    throw new Response("Akun bukan perwakilan staf atau siswa saat ini.", { status: 409 });
  if (target.name.trim() === representativeName) return { changed: false };
  throw new Response("Nama perwakilan atau kewenangan akun berubah. Muat ulang dan coba lagi.", {
    status: 409,
  });
}
