import { getAccess } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import { sendEmail } from "../email/email.server";
import { captureNotifications } from "./notifications.server";
import type { ReferenceStatus } from "./model";

export async function readReference(request: Request, env: Env, id: string) {
  const { account } = await getAccess(request, env);
  const row = await env.DB.prepare(
    `SELECT r.school_name AS schoolName,r.graduation_year AS graduationYear,r.house,
    q.expires_at AS expiresAt,s.request_id AS answered,
    CASE WHEN a.revision = q.revision AND a.status = 'pending' AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END AS current,
    CASE WHEN m.status = 'approved' AND m.house = r.house AND u.id != q.user_id THEN 1 ELSE 0 END AS eligible
    FROM membership_reference q JOIN membership_revision r ON r.user_id = q.user_id AND r.revision = q.revision
    JOIN membership_application a ON a.user_id = q.user_id
    JOIN user u ON u.id = ? AND lower(u.email) = q.to_email AND u.email_verified = 1
    LEFT JOIN alumni_membership m ON m.user_id = u.id
    LEFT JOIN membership_reference_response s ON s.request_id = q.id WHERE q.id = ?`
  )
    .bind(account.id, id)
    .first<{
      schoolName: string;
      graduationYear: number;
      house: string;
      expiresAt: string;
      answered: string | null;
      current: number;
      eligible: number;
    }>();
  if (!row) throw new Response("Permintaan tidak tersedia untuk akun ini.", { status: 403 });
  if (!row.current)
    throw new Response("Permintaan kedaluwarsa atau pengajuan telah berubah.", { status: 409 });
  if (!row.eligible)
    throw new Response("Referensi harus alumni disetujui dari house yang sama dan bukan pemohon.", {
      status: 403,
    });
  return {
    schoolName: row.schoolName,
    graduationYear: row.graduationYear,
    house: row.house,
    expiresAt: row.expiresAt,
    answered: !!row.answered,
  };
}

export async function respondReference(request: Request, env: Env, id: string, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await getAccess(request, env);
  const view = await readReference(request, env, id);
  if (view.answered) throw new Response("Respons sudah tersimpan.", { status: 409 });
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Response("Data tidak valid.", { status: 400 });
  const body = input as Record<string, unknown>;
  const known = body.personallyKnown === true || body.personallyKnown === "on";
  if (
    !["endorse", "decline", "cannot-confirm"].includes(String(body.outcome)) ||
    typeof body.outcome !== "string" ||
    (body.comment !== undefined && typeof body.comment !== "string") ||
    String(body.comment ?? "").length > 1000 ||
    (body.outcome === "endorse" && !known)
  )
    throw new Response(
      "Pilih respons yang valid. Dukungan memerlukan konfirmasi kenal pribadi semasa sekolah.",
      { status: 400 }
    );
  const result = await env.DB.prepare(
    `INSERT INTO membership_reference_response(request_id,actor_user_id,outcome,personally_known,comment)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM membership_reference q JOIN membership_application a
    ON a.user_id = q.user_id AND a.revision = q.revision JOIN membership_revision r ON r.user_id = a.user_id AND r.revision = a.revision
    JOIN user u ON u.id = ? AND u.email_verified = 1 AND lower(u.email) = q.to_email
    JOIN alumni_membership m ON m.user_id = u.id AND m.status = 'approved' AND m.house = r.house
    WHERE q.id = ? AND u.id != q.user_id AND a.status = 'pending' AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    AND NOT EXISTS(SELECT 1 FROM membership_reference_response WHERE request_id = ?)`
  )
    .bind(
      id,
      account.id,
      body.outcome,
      known ? 1 : 0,
      String(body.comment ?? "").trim(),
      account.id,
      id,
      id
    )
    .run();
  if (!result.meta.changes)
    throw new Response("Permintaan telah berubah atau sudah dijawab.", { status: 409 });
  const row = await env.DB.prepare(
    `SELECT user_id AS userId FROM membership_reference WHERE id = ?`
  )
    .bind(id)
    .first<{ userId: string }>();
  await captureNotifications(env, row!.userId);
  return { changed: true };
}

export async function referenceHistory(env: Env, userId: string) {
  // Only authorized reviewers call this projection. No request token is exposed.
  const rows = await env.DB.prepare(
    `SELECT q.revision,q.to_email AS email,q.requested_at AS requestedAt,q.expires_at AS expiresAt,
    s.actor_user_id AS actorUserId,s.outcome,s.personally_known AS personallyKnown,s.comment,s.occurred_at AS occurredAt
    FROM membership_reference q LEFT JOIN membership_reference_response s ON s.request_id = q.id
    WHERE q.user_id = ? ORDER BY q.revision DESC`
  )
    .bind(userId)
    .all<{
      revision: number;
      email: string;
      requestedAt: string;
      expiresAt: string;
      actorUserId: string | null;
      outcome: "endorse" | "decline" | "cannot-confirm" | null;
      personallyKnown: number | null;
      comment: string | null;
      occurredAt: string | null;
    }>();
  return rows.results;
}

export async function handleReferences(request: Request, env: Env) {
  const path = new URL(request.url).pathname;
  const match = path.match(/^\/api\/membership\/references\/([^/]+)$/);
  try {
    let value;
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (request.method === "GET") value = await readReference(request, env, id);
      else if (request.method === "POST")
        value = await respondReference(request, env, id, await request.json().catch(() => null));
      else return new Response(null, { status: 405 });
    } else {
      if (path !== "/api/membership/references") return new Response(null, { status: 404 });
      if (request.method !== "POST") return new Response(null, { status: 405 });
      value = await requestReference(request, env, await request.json().catch(() => null));
    }
    return Response.json(value, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof Response)) throw error;
    error.headers.set("Cache-Control", "no-store");
    return error;
  }
}

export async function referenceStatus(
  env: Env,
  userId: string,
  revision: number
): Promise<ReferenceStatus | null> {
  const row = await env.DB.prepare(
    `SELECT s.outcome,q.expires_at AS expiresAt FROM membership_reference q
    LEFT JOIN membership_reference_response s ON s.request_id = q.id WHERE q.user_id = ? AND q.revision = ?`
  )
    .bind(userId, revision)
    .first<{ outcome: string | null; expiresAt: string }>();
  if (!row) return null;
  if (row.outcome === "endorse") return "endorsed";
  if (row.outcome) return "manual-review";
  return row.expiresAt <= new Date().toISOString() ? "expired" : "waiting";
}

async function captureRequest(env: Env, userId: string, revision: number) {
  const row = await env.DB.prepare(
    `SELECT id,to_email AS email FROM membership_reference WHERE user_id = ? AND revision = ? AND delivered_at IS NULL`
  )
    .bind(userId, revision)
    .first<{ id: string; email: string }>();
  if (!row) return;
  try {
    await sendEmail(env, {
      to: row.email,
      subject: "Permintaan referensi alumni",
      text: `Ada permintaan referensi alumni. Masuk dengan alamat email ini untuk melihat dan merespons. Permintaan berlaku tujuh hari.\n${new URL(`/references/${row.id}`, env.BETTER_AUTH_URL).href}`,
    });
    await env.DB.prepare(
      `UPDATE membership_reference SET delivered_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    )
      .bind(row.id)
      .run();
  } catch {
    /* Persisted request can be captured again on retry. Keep applicant response neutral. */
  }
}

export async function requestReference(request: Request, env: Env, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await getAccess(request, env);
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Response("Data tidak valid.", { status: 400 });
  const body = input as Record<string, unknown>;
  const revision = Number(body.expectedRevision);
  if (
    (typeof body.expectedRevision !== "number" && typeof body.expectedRevision !== "string") ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    typeof body.email !== "string" ||
    body.email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
  )
    throw new Response("Isi email referensi dan versi pengajuan yang valid.", { status: 400 });
  const email = body.email.trim().toLowerCase();
  const result = await env.DB.prepare(
    `INSERT INTO membership_reference(id,user_id,revision,to_email)
    SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM membership_application a JOIN membership_revision r ON r.user_id = a.user_id AND r.revision = a.revision
    WHERE a.user_id = ? AND a.revision = ? AND a.status = 'pending' AND r.student_type = 'graduate')
    AND NOT EXISTS(SELECT 1 FROM alumni_membership WHERE user_id = ?)
    AND NOT EXISTS(SELECT 1 FROM membership_reference WHERE user_id = ? AND revision = ?)`
  )
    .bind(
      crypto.randomUUID(),
      account.id,
      revision,
      email,
      account.id,
      revision,
      account.id,
      account.id,
      revision
    )
    .run();
  if (!result.meta.changes) {
    const prior = await env.DB.prepare(
      `SELECT q.id FROM membership_reference q JOIN membership_application a
      ON a.user_id = q.user_id AND a.revision = q.revision
      WHERE q.user_id = ? AND q.revision = ? AND q.to_email = ? AND a.status = 'pending'
      AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS(SELECT 1 FROM membership_reference_response WHERE request_id = q.id)`
    )
      .bind(account.id, revision, email)
      .first();
    if (!prior)
      throw new Response(
        "Pengajuan telah berubah atau sudah memiliki referensi. Muat ulang status Anda.",
        { status: 409 }
      );
  }
  await captureRequest(env, account.id, revision);
  return {
    message:
      "Permintaan referensi tersimpan. Respons memerlukan autentikasi dan pemeriksaan kelayakan.",
  };
}
