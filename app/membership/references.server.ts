import { parseInput, responseInput, referenceInput } from "../http/validation";
import { referenceRepository } from "../db/reference.repository.server";
import { getAccess } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import { sendEmail } from "../email/email.server";
import { captureNotifications } from "./notifications.server";
import type { ReferenceStatus } from "./model";

export async function readReference(request: Request, env: Env, id: string) {
  const { account } = await getAccess(request, env);
  const row = await referenceRepository(env.DB).recipientView({ actorId: account.id, id: id });
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
  const body = parseInput(
    responseInput,
    input,
    "Pilih respons yang valid. Dukungan memerlukan konfirmasi kenal pribadi semasa sekolah."
  );
  const known = body.personallyKnown;
  const result = await referenceRepository(env.DB).insertResponse({
    id,
    actorId: account.id,
    outcome: body.outcome,
    known: known ? 1 : 0,
    comment: String(body.comment ?? "").trim(),
  });
  if (!result) throw new Response("Permintaan telah berubah atau sudah dijawab.", { status: 409 });
  const row = await referenceRepository(env.DB).requestOwner({ id: id });
  await captureNotifications(env, row!.userId);
  return { changed: true };
}

export async function referenceHistory(env: Env, userId: string) {
  // Only authorized reviewers call this projection. No request token is exposed.
  const rows = await referenceRepository(env.DB).history({ userId: userId });
  return rows;
}

export async function referenceStatus(
  env: Env,
  userId: string,
  revision: number
): Promise<ReferenceStatus | null> {
  const row = await referenceRepository(env.DB).status({ userId, revision: revision });
  if (!row) return null;
  if (row.outcome === "endorse") return "endorsed";
  if (row.outcome) return "manual-review";
  return row.expiresAt <= new Date().toISOString() ? "expired" : "waiting";
}

async function captureRequest(env: Env, userId: string, revision: number) {
  const row = await referenceRepository(env.DB).pendingCapture({
    userId,
    revision,
  });
  if (!row) return;
  try {
    await sendEmail(env, {
      to: row.email,
      subject: "Permintaan referensi alumni",
      text: `Ada permintaan referensi alumni. Masuk dengan alamat email ini untuk melihat dan merespons. Permintaan berlaku tujuh hari.\n${new URL(`/references/${row.id}`, env.BETTER_AUTH_URL).href}`,
    });
    await referenceRepository(env.DB).markCaptured({ id: row.id });
  } catch {
    /* Persisted request can be captured again on retry. Keep applicant response neutral. */
  }
}

export async function requestReference(request: Request, env: Env, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await getAccess(request, env);
  const body = parseInput(
    referenceInput,
    input,
    "Isi email referensi dan versi pengajuan yang valid."
  );
  const { email } = body;
  const revision = body.expectedRevision;
  const result = await referenceRepository(env.DB).insertRequest({
    id: crypto.randomUUID(),
    userId: account.id,
    revision,
    email,
  });
  if (!result) {
    const prior = await referenceRepository(env.DB).currentRequest({
      userId: account.id,
      revision,
      email,
    });
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
