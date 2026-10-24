import { getAccess, requirePrimary } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import {
  profileDeletionRepository,
  type ProfileDeletionEventRow,
  type ProfileDeletionRequestRow,
} from "../db/profile-deletion.repository.server";
import {
  parseInput,
  profileDeletionActionInput,
  profileDeletionCompleteInput,
  profileDeletionRequestInput,
} from "../http/validation";

const requestIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function origin(request: Request, env: Env) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
}

function overdue(row: ProfileDeletionRequestRow) {
  return row.status === "active" && Date.parse(row.dueAt) < Date.now();
}

function completedLate(row: ProfileDeletionRequestRow) {
  return !!row.completedAt && Date.parse(row.completedAt) > Date.parse(row.dueAt);
}

function memberProjection(row: ProfileDeletionRequestRow, profileExists: boolean) {
  return {
    id: row.id,
    requestedAt: row.requestedAt,
    dueAt: row.dueAt,
    status: row.status,
    overdue: overdue(row),
    completedLate: completedLate(row),
    profileExists,
    profileRemovedAt: row.profileRemovedAt,
    profileRemovalCount: row.profileRemovalCount,
    clarificationRemovedAt: row.clarificationRemovedAt,
    clarificationRemovalCount: row.clarificationRemovalCount,
    completedAt: row.completedAt,
    steps: {
      profileRemoved: row.profileRemovedAt !== null,
      clarificationRemoved: row.clarificationRemovedAt !== null,
    },
  };
}

function adminProjection(
  row: ProfileDeletionRequestRow & { schoolName: string | null; house: string | null },
  profileExists: boolean,
  events?: ProfileDeletionEventRow[]
) {
  return {
    id: row.id,
    memberUserId: row.memberUserId,
    schoolName: row.schoolName,
    house: row.house,
    requestedAt: row.requestedAt,
    dueAt: row.dueAt,
    status: row.status,
    overdue: overdue(row),
    completedLate: completedLate(row),
    profileExists,
    profileRemovedAt: row.profileRemovedAt,
    profileRemovedBy: row.profileRemovedBy,
    profileRemovalCount: row.profileRemovalCount,
    clarificationRemovedAt: row.clarificationRemovedAt,
    clarificationRemovedBy: row.clarificationRemovedBy,
    clarificationRemovalCount: row.clarificationRemovalCount,
    completedAt: row.completedAt,
    completedBy: row.completedBy,
    completionNote: row.completionNote,
    steps: {
      profileRemoved: row.profileRemovedAt !== null,
      clarificationRemoved: row.clarificationRemovedAt !== null,
    },
    ...(events ? { events } : {}),
  };
}

async function completedDetail(env: Env, requestId: string) {
  const repository = profileDeletionRepository(env.DB);
  const detail = await repository.detail(requestId);
  if (!detail) throw new Response("Permintaan penghapusan tidak ditemukan.", { status: 404 });
  return {
    request: adminProjection(detail.request, detail.request.profileExists === 1, detail.events),
  };
}

export async function readProfileDeletion(request: Request, env: Env) {
  const access = await getAccess(request, env);
  if (!["approved", "suspended"].includes(access.membership.status))
    throw new Response("Penghapusan profil tersedia setelah keanggotaan disetujui.", {
      status: 403,
    });
  const repository = profileDeletionRepository(env.DB);
  const [row, profileExists] = await Promise.all([
    repository.latestForMember(access.account.id),
    repository.profileExists(access.account.id),
  ]);
  return {
    request: row ? memberProjection(row, profileExists) : null,
    profileExists,
  };
}

export async function requestProfileDeletion(request: Request, env: Env, input: unknown) {
  origin(request, env);
  const access = await getAccess(request, env);
  if (!["approved", "suspended"].includes(access.membership.status))
    throw new Response("Penghapusan profil tersedia setelah keanggotaan disetujui.", {
      status: 403,
    });
  parseInput(
    profileDeletionRequestInput,
    input,
    "Konfirmasi bahwa Anda memahami permintaan penghapusan profil."
  );
  const repository = profileDeletionRepository(env.DB);
  const existing = await repository.latestForMember(access.account.id);
  if (existing?.status === "active")
    return {
      changed: false,
      request: memberProjection(existing, await repository.profileExists(access.account.id)),
    };

  const requestedAt = new Date().toISOString();
  const dueDate = new Date(requestedAt);
  dueDate.setUTCDate(dueDate.getUTCDate() + 30);
  const id = crypto.randomUUID();
  const inserted = await repository.create({
    id,
    memberId: access.account.id,
    requestedAt,
    dueAt: dueDate.toISOString(),
  });
  const row = await repository.latestForMember(access.account.id);
  if (!row || (!inserted && row.status !== "active"))
    throw new Response(
      "Profil tidak ditemukan. Ajukan penghapusan hanya setelah memiliki profil.",
      {
        status: 409,
      }
    );
  return {
    changed: true,
    request: memberProjection(row, await repository.profileExists(access.account.id)),
  };
}

export async function readProfileDeletionQueue(request: Request, env: Env) {
  await requirePrimary(request, env);
  const repository = profileDeletionRepository(env.DB);
  const { active, completed } = await repository.queue();
  return {
    active: active.map((row) => adminProjection(row, row.profileExists === 1)),
    completed: completed.map((row) => adminProjection(row, row.profileExists === 1)),
  };
}

export async function readProfileDeletionRequest(request: Request, env: Env, requestId: string) {
  await requirePrimary(request, env);
  if (!requestIdPattern.test(requestId))
    throw new Response("ID permintaan penghapusan tidak valid.", { status: 400 });
  return completedDetail(env, requestId);
}

async function processingConflict(env: Env, requestId: string) {
  if (!(await profileDeletionRepository(env.DB).detail(requestId)))
    throw new Response("Permintaan penghapusan tidak ditemukan.", { status: 404 });
  throw new Response("Tahap penghapusan telah berubah. Muat ulang dan coba lagi.", {
    status: 409,
  });
}

export async function removeProfileContent(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await requirePrimary(request, env);
  parseInput(profileDeletionActionInput, input, "Tindakan tidak valid.");
  if (!requestIdPattern.test(requestId))
    throw new Response("ID permintaan penghapusan tidak valid.", { status: 400 });
  const changed = await profileDeletionRepository(env.DB).removeProfile({
    id: crypto.randomUUID(),
    requestId,
    actorId: access.account.id,
    occurredAt: new Date().toISOString(),
  });
  if (!changed) await processingConflict(env, requestId);
  return { changed: true, ...(await completedDetail(env, requestId)) };
}

export async function removeClarificationContent(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await requirePrimary(request, env);
  parseInput(profileDeletionActionInput, input, "Tindakan tidak valid.");
  if (!requestIdPattern.test(requestId))
    throw new Response("ID permintaan penghapusan tidak valid.", { status: 400 });
  const changed = await profileDeletionRepository(env.DB).removeClarification({
    id: crypto.randomUUID(),
    requestId,
    actorId: access.account.id,
    occurredAt: new Date().toISOString(),
  });
  if (!changed) await processingConflict(env, requestId);
  return { changed: true, ...(await completedDetail(env, requestId)) };
}

export async function completeProfileDeletion(
  request: Request,
  env: Env,
  requestId: string,
  input: unknown
) {
  origin(request, env);
  const access = await requirePrimary(request, env);
  if (!requestIdPattern.test(requestId))
    throw new Response("ID permintaan penghapusan tidak valid.", { status: 400 });
  const { note } = parseInput(
    profileDeletionCompleteInput,
    input,
    "Isi bukti penyelesaian 1-1.000 karakter."
  );
  const changed = await profileDeletionRepository(env.DB).complete({
    id: crypto.randomUUID(),
    requestId,
    actorId: access.account.id,
    note,
    occurredAt: new Date().toISOString(),
  });
  if (!changed) await processingConflict(env, requestId);
  return { changed: true, ...(await completedDetail(env, requestId)) };
}
