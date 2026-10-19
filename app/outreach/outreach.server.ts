import { getAccess, requireDirectory, requirePrimary } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import { outreachRepository } from "../db/outreach.repository.server";
import {
  parseInput,
  outreachSendInput,
  outreachResponseInput,
  outreachActionInput,
  outreachTakeoverInput,
  outreachPageCursor,
  outreachAuditCursor,
} from "../http/validation";
import { sendEmail } from "../email/email.server";
import {
  formatOutreachAuditCursor,
  parseOutreachAuditCursor,
  type OutreachAuditCursor,
} from "./model";
function origin(request: Request, env: Env) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
}
function conflict() {
  throw new Response(
    "Status, batas penjangkauan, atau kelayakan berubah. Muat ulang dan coba lagi.",
    { status: 409 }
  );
}
export async function deliverOutreach(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown = {}
) {
  origin(request, env);
  const access = await requireDirectory(request, env);
  parseInput(outreachActionInput, input, "Tindakan tidak valid.");
  const repository = outreachRepository(env.DB);
  if (!(await repository.request(requestId, access.account.id)))
    throw new Response("Permintaan tidak ditemukan.", { status: 404 });
  await repository.reconcile();
  // A request has at most two notification intents: its invitation and one reminder.
  for (let attempt = 0; attempt < 2; attempt++) {
    const claim = await repository.claim(requestId, access.account.id);
    if (!claim) break;
    const delivery = await repository.delivery(requestId, access.account.id, claim.id);
    if (!delivery) {
      await repository.finishNotification(claim.id, "cancelled");
      continue;
    }
    try {
      await sendEmail(env, {
        to: delivery.email,
        subject:
          claim.kind === "reminder"
            ? "Pengingat permintaan bantuan sekolah"
            : "Permintaan bantuan sekolah",
        text: `${delivery.title}\nBatas respons: ${delivery.expiresAt}\nLihat rincian dan tanggapi: ${new URL(`/outreach/requests/${requestId}`, env.BETTER_AUTH_URL).href}\nMenyatakan minat tidak membagikan email Anda.`,
      });
      await repository.finishNotification(claim.id, "captured");
    } catch {
      await repository.finishNotification(claim.id, "pending");
      break;
    }
  }
  return { notificationPending: await repository.hasPendingNotification(requestId) };
}
export async function sendOutreach(request: Request, env: Env, needId: string, input: unknown) {
  origin(request, env);
  const access = await requireDirectory(request, env);
  const body = parseInput(
    outreachSendInput,
    input,
    "Pilih satu penerima dan versi kebutuhan yang valid."
  );
  const requestId = crypto.randomUUID();
  const rows = await outreachRepository(env.DB).send({
    id: requestId,
    needId,
    version: body.expectedVersion,
    recipientId: body.recipientUserId,
    actorId: access.account.id,
    now: new Date().toISOString(),
  });
  if (!rows.length) conflict();
  return { requestId, ...(await deliverOutreach(request, env, requestId)) };
}
export async function readOutreachNeed(request: Request, env: Env, needId: string) {
  const access = await requireDirectory(request, env);
  const repository = outreachRepository(env.DB);
  const detail = await repository.needWorkspace(needId);
  if (!detail.available && !detail.frozen && !detail.closed)
    throw new Response("Kebutuhan tidak tersedia untuk penjangkauan.", { status: 404 });
  if (!detail.need) throw new Response("Kebutuhan tidak ditemukan.", { status: 404 });
  return {
    need: detail.need,
    actorId: access.account.id,
    canSend: detail.available,
    closed: detail.closed,
    requests: detail.requests,
    notifications: detail.notifications,
  };
}
export async function readOutreachRequest(request: Request, env: Env, requestId: string) {
  const access = await getAccess(request, env);
  const repository = outreachRepository(env.DB);
  await repository.reconcile();
  const row = await repository.requestWithNeed(requestId, access.account.id);
  if (!row) throw new Response("Permintaan tidak ditemukan.", { status: 404 });
  return row;
}
export async function respondOutreach(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await getAccess(request, env);
  await readOutreachRequest(request, env, requestId);
  const body = parseInput(
    outreachResponseInput,
    input,
    "Pilih berminat atau menolak dengan alasan opsional."
  );
  const rows = await outreachRepository(env.DB).respond({
    requestId,
    actorId: access.account.id,
    outcome: body.outcome,
    reason: body.reason,
    now: new Date().toISOString(),
  });
  if (!rows.length) conflict();
  return { changed: true };
}

export async function closeOutreachNeed(
  request: Request,
  env: Env,
  needId: string,
  input: unknown
) {
  origin(request, env);
  const access = await requireDirectory(request, env);
  parseInput(outreachActionInput, input, "Tindakan tidak valid.");
  if (!(await outreachRepository(env.DB).close(needId, access.account.id)).length) conflict();
  return { changed: true };
}

export async function takeOverOutreach(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await requireDirectory(request, env);
  const body = parseInput(outreachTakeoverInput, input, "Lihat kembali koordinator permintaan.");
  if (
    !(
      await outreachRepository(env.DB).takeOver(
        requestId,
        access.account.id,
        body.expectedCoordinatorUserId
      )
    ).length
  )
    conflict();
  return { changed: true };
}
export async function readOutreachAudit(request: Request, env: Env) {
  await requirePrimary(request, env);
  const raw = new URL(request.url).searchParams.get("after") ?? "";
  let after: OutreachAuditCursor | null = null;
  if (raw) {
    parseInput(outreachAuditCursor, raw, "Kursor tidak valid.");
    after = parseOutreachAuditCursor(raw);
  }
  const rows = await outreachRepository(env.DB).audit(after);
  const last = rows[49];
  return {
    events: rows.slice(0, 50),
    nextCursor: rows.length > 50 && last ? formatOutreachAuditCursor(last) : null,
  };
}

export async function remindOutreach(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await requireDirectory(request, env);
  parseInput(outreachActionInput, input, "Tindakan tidak valid.");
  const repo = outreachRepository(env.DB);
  await repo.reconcile();
  if (!(await repo.remind(requestId, access.account.id)).length) conflict();
  return { changed: true, ...(await deliverOutreach(request, env, requestId)) };
}

export async function readOutreach(request: Request, env: Env) {
  const access = await getAccess(request, env);
  const repo = outreachRepository(env.DB);
  const searchParams = new URL(request.url).searchParams;
  const needsAfter = parseInput(
    outreachPageCursor,
    searchParams.get("needsAfter") ?? "",
    "Kursor tidak valid."
  );
  const requestsAfter = parseInput(
    outreachPageCursor,
    searchParams.get("requestsAfter") ?? "",
    "Kursor tidak valid."
  );
  const { needs, requests } = await repo.list(
    access.account.id,
    access.permissions.directory,
    needsAfter,
    requestsAfter
  );
  return {
    needs: needs.slice(0, 50),
    requests: requests.slice(0, 50),
    needsNextCursor: needs.length > 50 ? needs[49].id : null,
    requestsNextCursor: requests.length > 50 ? requests[49].id : null,
    needsAfter,
    requestsAfter,
    isCoordinator: access.permissions.directory,
  };
}
