import { suspensionRepository } from "../db/suspension.repository.server";
import { suspensionStatus } from "./suspensions.server";
import {
  parseInput,
  applicationInput,
  decisionInput,
  houseCorrectionInput,
  queueCursor,
} from "../http/validation";
import { membershipRepository } from "../db/membership.repository.server";
import { getAccess, requireReviewer } from "../authorization/permissions.server";
export { requireReviewer } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";

import { captureNotifications } from "./notifications.server";
import { referenceStatus, referenceHistory } from "./references.server";

async function applicationDetails(env: Env, userId: string) {
  // Callers authorize ownership/reviewer access before selecting private fields.
  const details = await membershipRepository(env.DB).applicantDetails(userId);
  return {
    ...details,
    referenceStatus: details.application
      ? await referenceStatus(env, userId, details.application.revision)
      : null,
  };
}

export async function readApplication(env: Env, userId: string) {
  return {
    ...(await applicationDetails(env, userId)),
    suspension: await suspensionStatus(env, userId),
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

export async function reviewQueue(request: Request, env: Env) {
  await requireReviewer(request, env);
  const after = new URL(request.url).searchParams.get("after") || "";
  parseInput(queueCursor, after, "Kursor tidak valid.");
  const rows = await membershipRepository(env.DB).reviewQueue({ after: after });
  const members = await suspensionRepository(env.DB).queue(after);
  return {
    members: members.slice(0, 100),
    memberNextCursor: members.length > 100 ? members[99].userId : null,
    applications: rows.slice(0, 100),
    nextCursor: rows.length > 100 ? rows[99].userId : null,
  };
}

export async function reviewDetails(request: Request, env: Env, userId: string) {
  await requireReviewer(request, env);
  const details = await applicationDetails(env, userId);
  const membership = await membershipRepository(env.DB).membership(userId);
  const corrections = await membershipRepository(env.DB).correctionHistory(userId);
  if (!details.application && !membership)
    throw new Response("Pengajuan tidak ditemukan.", { status: 404 });
  const history = await membershipRepository(env.DB).decisionHistory({ userId: userId });
  const statusDecisions = await suspensionRepository(env.DB).history(userId);
  const suspensionRequests = await suspensionRepository(env.DB).requests(userId);
  return {
    ...details,
    application: details.application ?? {
      userId,
      revision: corrections.length,
      status: "approved" as const,
      updatedAt: "",
    },
    membership,
    decisions: history,
    references: await referenceHistory(env, userId),
    corrections,
    statusVersion: statusDecisions[0]?.version ?? 0,
    statusDecisions,
    suspensionRequests,
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

export async function correctApprovedHouse(
  request: Request,
  env: Env,
  userId: string,
  input: unknown
) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await requireReviewer(request, env);
  if (
    account.id === userId ||
    (await referenceHistory(env, userId)).some(
      (r) => r.outcome === "endorse" && r.actorUserId === account.id
    )
  )
    throw new Response("Administrator lain harus meninjau koreksi ini.", { status: 403 });
  const body = parseInput(
    houseCorrectionInput,
    input,
    "Pilih satu house dan catat tinjauan independen baru, alasan, serta pesan untuk pemohon."
  );
  const result = await membershipRepository(env.DB).correctHouse({
    ...body,
    id: crypto.randomUUID(),
    userId,
    actorId: account.id,
    revision: body.expectedRevision,
  });
  if (!result)
    throw new Response(
      "Keanggotaan atau kewenangan telah berubah. Muat ulang sebelum mengoreksi.",
      { status: 409 }
    );
  return { changed: true, ...(await captureNotifications(env, userId)) };
}
