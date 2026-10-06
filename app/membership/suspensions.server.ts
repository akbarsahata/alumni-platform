import { getAccess } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import { suspensionRepository } from "../db/suspension.repository.server";
import { parseInput, membershipStatusInput, suspensionRequestInput } from "../http/validation";
import { requireReviewer } from "../authorization/permissions.server";
import { referenceHistory } from "./references.server";
import { captureNotifications } from "./notifications.server";

export async function suspensionStatus(env: Env, userId: string) {
  const repository = suspensionRepository(env.DB);
  const [decisions, requests] = await Promise.all([
    repository.history(userId),
    repository.requests(userId),
  ]);
  return {
    version: decisions[0]?.version ?? 0,
    suspensionId: decisions[0]?.outcome === "suspended" ? decisions[0].id : null,
    decisions: decisions.map(({ id, outcome, applicantMessage, occurredAt }) => ({
      id,
      outcome,
      applicantMessage,
      occurredAt,
    })),
    requests: requests.map(({ id, explanation, requestedAt, resolvedBy }) => ({
      id,
      explanation,
      requestedAt,
      resolved: resolvedBy !== null,
    })),
  };
}
export async function decideMembershipStatus(
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
    throw new Response("Administrator lain harus meninjau keanggotaan ini.", { status: 403 });
  const body = parseInput(
    membershipStatusInput,
    input,
    "Catat keputusan, alasan internal, dan pesan untuk anggota."
  );
  const changed = await suspensionRepository(env.DB).decide({
    ...body,
    id: crypto.randomUUID(),
    userId,
    actorId: account.id,
  });
  const notification = await captureNotifications(env, userId);
  if (!changed)
    throw new Response("Keanggotaan atau kewenangan telah berubah. Muat ulang sebelum meninjau.", {
      status: 409,
    });
  return { changed, ...notification };
}
export async function requestSuspensionReview(request: Request, env: Env, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account, membership } = await getAccess(request, env);
  if (membership.status !== "suspended")
    throw new Response("Keanggotaan tidak ditangguhkan.", { status: 409 });
  const body = parseInput(
    suspensionRequestInput,
    input,
    "Catat penjelasan untuk tinjauan penangguhan."
  );
  const changed = await suspensionRepository(env.DB).request({
    ...body,
    id: crypto.randomUUID(),
    userId: account.id,
  });
  if (!changed)
    throw new Response("Permintaan sudah tercatat atau status telah berubah.", { status: 409 });
  return { changed: true };
}
