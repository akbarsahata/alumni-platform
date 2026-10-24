import { getAccess, requireDirectory, requirePrimary } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import { outcomeRepository } from "../db/outcome.repository.server";
import { outreachRepository } from "../db/outreach.repository.server";
import { schoolNeedsRepository } from "../db/school-needs.repository.server";
import {
  parseInput,
  outreachSendInput,
  outreachResponseInput,
  outreachActionInput,
  outreachConsentInput,
  outreachOutcomeInput,
  outreachStaffRecipientInput,
  outreachTakeoverInput,
  outreachClarificationInput,
  outreachPageCursor,
  outreachAuditCursor,
} from "../http/validation";
import { sendEmail } from "../email/email.server";
import { deliverIntroductionAttempt } from "./introduction-delivery";
import {
  formatOutreachAuditCursor,
  isClarificationOpenStatus,
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
      await sendEmail(
        env,
        {
          to: delivery.email,
          subject:
            claim.kind === "reminder"
              ? "Pengingat permintaan bantuan sekolah"
              : "Permintaan bantuan sekolah",
          text: `${delivery.title}\nBatas respons: ${delivery.expiresAt}\nLihat rincian dan tanggapi: ${new URL(`/outreach/requests/${requestId}`, env.BETTER_AUTH_URL).href}\nMenyatakan minat tidak membagikan email Anda.`,
        },
        { idempotencyKey: `outreach-notification:${claim.id}` }
      );
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
  const [detail, staffContacts, outcomeRows] = await Promise.all([
    repository.needWorkspace(needId),
    schoolNeedsRepository(env.DB).staffContacts(),
    outcomeRepository(env.DB).forNeed(needId, access.account.id),
  ]);
  if (!detail.available && !detail.frozen && !detail.closed)
    throw new Response("Kebutuhan tidak tersedia untuk penjangkauan.", { status: 404 });
  const need = detail.need;
  if (!need) throw new Response("Kebutuhan tidak ditemukan.", { status: 404 });
  const outcomes = detail.requests.map((request) => {
    const current = outcomeRows.current.find((row) => row.requestId === request.id) ?? null;
    const events = outcomeRows.events.filter((event) => event.requestId === request.id);
    return { requestId: request.id, current, events, latest: events.at(-1) ?? null };
  });
  return {
    need: detail.staffRecipient ? { ...need, staffContactName: detail.staffRecipient.name } : need,
    actorId: access.account.id,
    canSend: detail.available,
    closed: detail.closed,
    closedAt: detail.closedAt,
    requests: detail.requests,
    notifications: detail.notifications,
    staffRecipient: detail.staffRecipient,
    staffContacts,
    sharing: detail.sharing,
    outcomes,
    canChangeStaff: detail.requests.length > 0,
  };
}
export async function readOutreachRequest(request: Request, env: Env, requestId: string) {
  const access = await getAccess(request, env);
  const repository = outreachRepository(env.DB);
  await repository.reconcile();
  const [row, outcomeRows] = await Promise.all([
    repository.requestDetail(requestId, access.account.id),
    outcomeRepository(env.DB).forRequest(requestId, access.account.id),
  ]);
  if (!row) throw new Response("Permintaan tidak ditemukan.", { status: 404 });
  const isRecipient = row.request.recipientUserId === access.account.id;
  const expired = Date.parse(row.request.expiresAt) <= Date.now();
  const active = row.sharing.find(
    (item) => !item.sharedAt && !item.withdrawnAt && !item.invalidatedAt
  );
  const currentStaffId = row.staffRecipient?.userId;
  const sharedWithCurrent =
    !!currentStaffId &&
    row.sharing.some((item) => !!item.sharedAt && item.staffUserId === currentStaffId);
  const canConsent =
    isRecipient &&
    row.request.status === "interested" &&
    !expired &&
    !row.closed &&
    !active &&
    !sharedWithCurrent &&
    row.eligible &&
    !!row.staffRecipient?.active;
  const canWithdraw =
    isRecipient && !!active && ["pending", "claimed"].includes(active.deliveryState);
  const canRespond = isRecipient && row.request.status === "pending" && !expired;
  const canClarify =
    isClarificationOpenStatus(row.request.status) && !expired && !row.closed && row.eligible;
  const outcome = outcomeRows.current
    ? {
        ...outcomeRows.current,
        events: outcomeRows.events,
        latest: outcomeRows.events.at(-1) ?? null,
      }
    : null;
  const canWriteOutcome =
    isRecipient &&
    access.membership.status === "approved" &&
    row.request.status === "interested" &&
    !!outcome;
  return {
    ...row,
    clarification: row.clarification.map(({ authorUserId, ...message }) => ({
      ...message,
      mine: authorUserId === access.account.id,
    })),
    need: row.staffRecipient
      ? { ...row.need, staffContactName: row.staffRecipient.name }
      : row.need,
    viewer: { isRecipient, email: isRecipient ? access.account.email : null },
    outcome,
    access: {
      canConsent,
      canWithdraw,
      canRespond,
      canClarify,
      expired,
      canConfirm: canWriteOutcome && outcome.latest?.kind !== "confirm",
      canCorrect: canWriteOutcome,
      canRecord: access.permissions.directory && !!outcome,
    },
  };
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

export async function clarifyOutreach(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await getAccess(request, env);
  const body = parseInput(outreachClarificationInput, input, "Tulis pesan klarifikasi yang valid.");
  const repository = outreachRepository(env.DB);
  await repository.reconcile();
  const row = (
    await repository.clarify({
      id: crypto.randomUUID(),
      requestId,
      actorId: access.account.id,
      body: body.body,
      now: new Date().toISOString(),
    })
  )[0];
  if (!row) {
    if (!(await repository.requestDetail(requestId, access.account.id)))
      throw new Response("Permintaan tidak ditemukan.", { status: 404 });
    throw new Response("Percakapan klarifikasi tidak lagi tersedia.", { status: 409 });
  }
  const counterpart = await repository.clarificationCounterpart(
    requestId,
    access.account.id,
    row.authorRole
  );
  let notified = false;
  if (counterpart) {
    try {
      await sendEmail(env, {
        to: counterpart.email,
        subject:
          row.authorRole === "member"
            ? "Klarifikasi baru pada permintaan bantuan sekolah"
            : "Balasan klarifikasi permintaan bantuan sekolah",
        text: `Ada pesan klarifikasi privat baru pada permintaan bantuan sekolah.\nBuka halaman permintaan untuk membacanya: ${new URL(`/outreach/requests/${requestId}`, env.BETTER_AUTH_URL).href}`,
      });
      notified = true;
    } catch {
      notified = false;
    }
  }
  return { changed: true, notified };
}

async function deliverIntroduction(
  env: Env,
  requestId: string,
  initiatingCoordinatorId: string | null
) {
  return deliverIntroductionAttempt({
    requestId,
    initiatingCoordinatorId,
    now: new Date().toISOString(),
    repository: outreachRepository(env.DB),
    send: (message, options) => sendEmail(env, message, options),
  });
}

export async function giveConsent(request: Request, env: Env, requestId: string, input: unknown) {
  origin(request, env);
  const access = await getAccess(request, env);
  const detail = await readOutreachRequest(request, env, requestId);
  if (!detail.viewer.isRecipient)
    throw new Response("Permintaan tidak ditemukan.", { status: 404 });
  const body = parseInput(outreachConsentInput, input, "Centang persetujuan berbagi email.");
  if (detail.request.status === "pending")
    throw new Response("Nyatakan minat terlebih dahulu sebelum memberikan persetujuan.", {
      status: 409,
    });
  if (["declined", "cancelled", "expired"].includes(detail.request.status))
    throw new Response("Permintaan ini sudah ditutup.", { status: 409 });
  if (detail.closed)
    throw new Response(
      "Kebutuhan sudah ditutup. Persetujuan perkenalan baru tidak dapat diberikan, tetapi hasil bantuan tetap dapat dikonfirmasi.",
      { status: 409 }
    );
  if (detail.access.expired)
    throw new Response("Batas respons telah lewat. Persetujuan baru tidak dapat diberikan.", {
      status: 409,
    });
  if (!detail.eligible)
    throw new Response("Profil atau keanggotaan tidak memenuhi syarat untuk perkenalan.", {
      status: 409,
    });
  if (!detail.staffRecipient?.active)
    throw new Response("Kontak staf penerima perkenalan tidak aktif.", { status: 409 });
  if (
    body.expectedStaffUserId !== detail.staffRecipient.userId ||
    body.expectedMemberEmail !== detail.viewer.email
  )
    throw new Response(
      "Kontak staf atau email Anda berubah. Periksa kembali dan centang persetujuan baru.",
      {
        status: 409,
      }
    );
  const repository = outreachRepository(env.DB);
  const rows = await repository.consent({
    id: crypto.randomUUID(),
    requestId,
    memberId: access.account.id,
    expectedStaffUserId: body.expectedStaffUserId,
    expectedMemberEmail: body.expectedMemberEmail,
    now: new Date().toISOString(),
  });
  if (!rows.length) {
    const active = await repository.activeIntroduction(requestId, access.account.id);
    if (active?.sharedAt)
      throw new Response("Email sudah dibagikan kepada kontak staf ini.", { status: 409 });
    if (active) throw new Response("Persetujuan sudah tercatat.", { status: 409 });
    throw new Response(
      "Persetujuan belum dapat dicatat. Muat ulang dan periksa minat, batas respons, kelayakan, dan kontak staf.",
      { status: 409 }
    );
  }
  return { changed: true, ...(await deliverIntroduction(env, requestId, null)) };
}

export async function withdrawConsent(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await getAccess(request, env);
  parseInput(outreachActionInput, input, "Tindakan tidak valid.");
  const row = await outreachRepository(env.DB).requestWithNeed(requestId, access.account.id);
  if (!row || row.request.recipientUserId !== access.account.id)
    throw new Response("Permintaan tidak ditemukan.", { status: 404 });
  const rows = await outreachRepository(env.DB).withdraw(
    requestId,
    access.account.id,
    new Date().toISOString()
  );
  if (!rows.length) {
    const active = await outreachRepository(env.DB).activeIntroduction(
      requestId,
      access.account.id
    );
    if (active?.sharedAt)
      throw new Response("Email sudah dibagikan dan tidak dapat ditarik kembali.", { status: 409 });
    if (active)
      throw new Response("Pengiriman sedang berlangsung. Persetujuan belum dapat ditarik.", {
        status: 409,
      });
    throw new Response("Tidak ada persetujuan aktif untuk ditarik.", { status: 409 });
  }
  return { changed: true };
}

export async function retryIntroduction(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await requireDirectory(request, env);
  parseInput(outreachActionInput, input, "Tindakan tidak valid.");
  if (!(await outreachRepository(env.DB).request(requestId, access.account.id)))
    throw new Response("Permintaan tidak ditemukan.", { status: 404 });
  return { changed: true, ...(await deliverIntroduction(env, requestId, access.account.id)) };
}

export async function changeStaffRecipient(
  request: Request,
  env: Env,
  needId: string,
  input: unknown
) {
  origin(request, env);
  const access = await requireDirectory(request, env);
  const body = parseInput(
    outreachStaffRecipientInput,
    input,
    "Pilih kontak staf penerima perkenalan yang valid."
  );
  const rows = await outreachRepository(env.DB).changeStaffRecipient({
    needId,
    actorId: access.account.id,
    expectedStaffUserId: body.expectedStaffUserId,
    staffUserId: body.staffUserId,
    now: new Date().toISOString(),
  });
  if (!rows.length)
    throw new Response("Kontak staf berubah atau tidak valid. Muat ulang dan coba lagi.", {
      status: 409,
    });
  return { changed: true };
}

export async function recordOutreachOutcome(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await getAccess(request, env);
  const detail = await readOutreachRequest(request, env, requestId);
  const action = input && typeof input === "object" && "action" in input ? input.action : null;
  if (action === "record") {
    if (!access.permissions.directory)
      throw new Response("Peran koordinator direktori diperlukan untuk mencatat hasil.", {
        status: 403,
      });
  } else if (action === "confirm" || action === "correct") {
    if (!detail.viewer.isRecipient)
      throw new Response("Hanya alumni penerima yang dapat mengonfirmasi atau mengoreksi hasil.", {
        status: 403,
      });
    if (access.membership.status !== "approved")
      throw new Response(
        "Keanggotaan Anda sedang ditinjau. Riwayat hasil dapat dilihat, tetapi belum dapat diubah.",
        { status: 403 }
      );
  }
  const body = parseInput(
    outreachOutcomeInput,
    input,
    "Pilih hasil bantuan dan isi catatan 1-500 karakter."
  );
  if (!detail.outcome)
    throw new Response("Hasil bantuan baru tersedia setelah perkenalan dikirim.", { status: 409 });
  const rows = await outcomeRepository(env.DB).append({
    id: crypto.randomUUID(),
    requestId,
    actorId: access.account.id,
    actorKind: body.action === "record" ? "coordinator" : "member",
    kind: body.action,
    expectedRevision: body.expectedRevision,
    state: body.action === "confirm" ? null : body.state,
    note: body.action === "confirm" ? null : body.note,
  });
  if (!rows)
    throw new Response(
      "Hasil bantuan atau kewenangan telah berubah. Muat ulang, tinjau hasil terbaru, lalu simpan lagi.",
      { status: 409 }
    );
  return { changed: true, revision: rows.revision, state: rows.state };
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
