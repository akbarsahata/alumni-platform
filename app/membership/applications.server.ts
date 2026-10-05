import { parseInput, applicationInput, decisionInput, queueCursor } from "../http/validation";
import { membershipRepository } from "../db/membership.repository.server";
import { getAccess } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";

import { captureNotifications } from "./notifications.server";
import { referenceStatus, referenceHistory } from "./references.server";

export async function readApplication(env: Env, userId: string) {
  // Callers authorize ownership/reviewer access before selecting private fields.
  const details = await membershipRepository(env.DB).applicantDetails(userId);
  return {
    ...details,
    referenceStatus: details.application
      ? await referenceStatus(env, userId, details.application.revision)
      : null,
  };
}

export async function submitApplication(request: Request, env: Env, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await getAccess(request, env);
  const body = parseInput(
    applicationInput,
    input,
    "Isi identitas sekolah, satu house, dan penjelasan yang valid."
  );
  const { schoolName, explanation, graduationYear, attendanceStart, attendanceEnd } = body;
  const expected = body.expectedRevision;
  const result = await membershipRepository(env.DB).insertRevision({
    userId: account.id,
    revision: expected + 1,
    schoolName,
    studentType: body.studentType,
    graduationYear,
    attendanceStart,
    attendanceEnd,
    house: body.house,
    explanation,
    expected,
  });
  const notification = await captureNotifications(env, account.id);
  if (!result)
    throw new Response(
      "Pengajuan telah berubah atau keanggotaan sudah tercatat. Muat ulang status Anda.",
      { status: 409 }
    );
  return { changed: true, ...notification };
}

export async function requireReviewer(request: Request, env: Env) {
  const access = await getAccess(request, env);
  if (!access.permissions.reviewMembership)
    throw new Response("Akses tidak diizinkan.", { status: 403 });
  return access;
}

export async function reviewQueue(request: Request, env: Env) {
  await requireReviewer(request, env);
  const after = new URL(request.url).searchParams.get("after") || "";
  parseInput(queueCursor, after, "Kursor tidak valid.");
  const rows = await membershipRepository(env.DB).reviewQueue({ after: after });
  return {
    applications: rows.slice(0, 100),
    nextCursor: rows.length > 100 ? rows[99].userId : null,
  };
}

export async function reviewDetails(request: Request, env: Env, userId: string) {
  await requireReviewer(request, env);
  const details = await readApplication(env, userId);
  if (!details.application) throw new Response("Pengajuan tidak ditemukan.", { status: 404 });
  const history = await membershipRepository(env.DB).decisionHistory({ userId: userId });
  return {
    ...details,
    application: details.application,
    decisions: history,
    references: await referenceHistory(env, userId),
  };
}

export async function decideApplication(
  request: Request,
  env: Env,
  userId: string,
  input: unknown
) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await requireReviewer(request, env);
  if (account.id === userId)
    throw new Response("Anda tidak dapat meninjau pengajuan sendiri.", { status: 403 });
  const references = await referenceHistory(env, userId);
  if (
    references.some(
      (reference) => reference.outcome === "endorse" && reference.actorUserId === account.id
    )
  )
    throw new Response("Administrator lain harus meninjau pengajuan yang Anda dukung.", {
      status: 403,
    });
  const body = parseInput(
    decisionInput,
    input,
    "Pilih keputusan yang valid dan catat pemeriksaan independen melalui alumni tepercaya atau staf sekolah."
  );
  const expected = body.expectedRevision;
  const { reason, applicantMessage, checkNote } = body;
  const result = await membershipRepository(env.DB).insertDecision({
    id: crypto.randomUUID(),
    userId,
    revision: expected,
    actorId: account.id,
    outcome: body.outcome,
    reason,
    applicantMessage,
    checkSource: body.checkSource,
    checkNote,
  });
  const notification = await captureNotifications(env, userId);
  if (!result)
    throw new Response("Pengajuan atau kewenangan telah berubah. Muat ulang sebelum meninjau.", {
      status: 409,
    });
  return { changed: true, ...notification };
}
