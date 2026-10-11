import { getAccess } from "../authorization/permissions.server";
import { schoolNeedsRepository } from "../db/school-needs.repository.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import {
  parseInput,
  schoolNeedApprovalInput,
  schoolNeedCursor,
  schoolNeedInput,
} from "../http/validation";
import type { LocationMode, NeedCategory, ParticipationTerm } from "./model";

const submitterRoles = ["staff", "student", "directory-coordinator"] as const;

function requireSubmitter(roles: string[]) {
  if (!submitterRoles.some((role) => roles.includes(role)))
    throw new Response("Peran sekolah atau koordinator direktori diperlukan.", { status: 403 });
}

function requireOrigin(request: Request, env: Env) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
}

export async function readSchoolNeeds(request: Request, env: Env) {
  const access = await getAccess(request, env);
  requireSubmitter(access.roles);
  const searchParams = new URL(request.url).searchParams;
  const cursor = (key: string) => {
    const value = searchParams.get(key);
    if (!value) return null;
    const parsed = parseInput(schoolNeedCursor, value, "Kursor tidak valid.");
    const [updatedAt, id] = parsed.split("|");
    return { updatedAt, id };
  };
  const page = <T extends { id: string; updatedAt: string }>(rows: T[]) => {
    const items = rows.slice(0, 100);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > 100 && last ? `${last.updatedAt}|${last.id}` : null,
    };
  };
  const repository = schoolNeedsRepository(env.DB);
  const [ownRows, staffContacts, staffRows, coordinatorRows] = await Promise.all([
    repository.ownNeeds(access.account.id, cursor("ownAfter")),
    repository.staffContacts(),
    access.roles.includes("staff")
      ? repository.staffQueue(access.account.id, cursor("staffAfter"))
      : [],
    access.roles.includes("directory-coordinator")
      ? repository.coordinatorQueue(cursor("coordinatorAfter"))
      : [],
  ]);
  const ownNeeds = page(ownRows);
  const staffQueue = page(staffRows);
  const coordinatorQueue = page(coordinatorRows);
  return {
    ownNeeds: ownNeeds.items,
    ownNeedsNextCursor: ownNeeds.nextCursor,
    staffContacts,
    staffQueue: staffQueue.items,
    staffQueueNextCursor: staffQueue.nextCursor,
    coordinatorQueue: coordinatorQueue.items,
    coordinatorQueueNextCursor: coordinatorQueue.nextCursor,
  };
}

export async function readSchoolNeed(request: Request, env: Env, needId: string) {
  const access = await getAccess(request, env);
  requireSubmitter(access.roles);
  const repository = schoolNeedsRepository(env.DB);
  const details = await repository.detail(needId, access.account.id);
  if (!details) throw new Response("Kebutuhan tidak ditemukan.", { status: 404 });
  const isOwner = details.need.submitterUserId === access.account.id;
  const isStaffReviewer =
    details.need.staffContactUserId === access.account.id && access.roles.includes("staff");
  const isCoordinatorReviewer =
    access.roles.includes("directory-coordinator") &&
    ((details.need.staffValidated && !details.need.coordinatorApproved) ||
      details.approvals.some(
        (approval) =>
          approval.version === details.need.version &&
          approval.stage === "directory-approval" &&
          approval.actorUserId === access.account.id
      ));
  if (!isOwner && !isStaffReviewer && !isCoordinatorReviewer)
    throw new Response("Kebutuhan tidak ditemukan.", { status: 404 });
  const reviewer = isStaffReviewer || isCoordinatorReviewer;
  const { submitterUserId: _submitterUserId, ...need } = details.need;
  const actorAlreadyApproved = details.approvals.some(
    (approval) => approval.version === need.version && approval.actorUserId === access.account.id
  );
  return {
    need,
    staffContacts: await repository.staffContacts(),
    revisions: details.revisions.map(({ actorUserId, ...revision }) =>
      reviewer ? { ...revision, actorUserId } : revision
    ),
    approvals: details.approvals.map(({ actorUserId, ...approval }) =>
      reviewer ? { ...approval, actorUserId } : approval
    ),
    access: {
      canEdit: isOwner,
      canValidate: isStaffReviewer && !need.staffValidated && !actorAlreadyApproved,
      canApprove:
        isCoordinatorReviewer &&
        need.staffValidated &&
        !need.coordinatorApproved &&
        !actorAlreadyApproved,
    },
  };
}

type ParsedNeed = {
  category: NeedCategory;
  title: string;
  purpose: string;
  requestedHelp: string;
  timeCommitment: string;
  timing: string;
  deadline: string | null;
  locationMode: LocationMode;
  locationDetails: string;
  staffContactUserId: string;
  participationTerms: ParticipationTerm;
  paidDetails: string;
  initiativeLink: string;
  expectedVersion?: number;
};

export async function submitSchoolNeed(request: Request, env: Env, input: unknown) {
  requireOrigin(request, env);
  const access = await getAccess(request, env);
  requireSubmitter(access.roles);
  const body = parseInput(
    schoolNeedInput,
    input,
    "Lengkapi tujuan, bantuan, komitmen, waktu, lokasi, kontak staf, dan ketentuan partisipasi."
  ) as ParsedNeed;
  if (body.expectedVersion !== undefined)
    throw new Response("Versi tidak diperlukan untuk mengirim kebutuhan baru.", { status: 400 });
  const { expectedVersion: _expectedVersion, ...need } = body;
  const rows = await schoolNeedsRepository(env.DB).submit({
    ...need,
    id: crypto.randomUUID(),
    actorId: access.account.id,
    occurredAt: new Date().toISOString(),
  });
  if (!rows.length)
    throw new Response("Peran pengirim atau kontak staf berubah. Muat ulang dan coba lagi.", {
      status: 409,
    });
  return { needId: rows[0].id, changed: true };
}

export async function editSchoolNeed(request: Request, env: Env, needId: string, input: unknown) {
  requireOrigin(request, env);
  const access = await getAccess(request, env);
  requireSubmitter(access.roles);
  const repository = schoolNeedsRepository(env.DB);
  const visibility = await repository.visibility(needId, access.account.id);
  if (!visibility || visibility.submitterUserId !== access.account.id)
    throw new Response("Kebutuhan tidak ditemukan.", { status: 404 });
  const body = parseInput(
    schoolNeedInput,
    input,
    "Periksa kembali seluruh rincian kebutuhan dan versi yang sedang ditinjau."
  ) as ParsedNeed;
  if (body.expectedVersion === undefined)
    throw new Response("Versi kebutuhan diperlukan untuk menyimpan perubahan.", { status: 400 });
  const { expectedVersion, ...need } = body;
  const rows = await repository.edit({
    ...need,
    id: needId,
    actorId: access.account.id,
    expectedVersion,
    occurredAt: new Date().toISOString(),
  });
  if (!rows.length)
    throw new Response("Kebutuhan atau kewenangan telah berubah. Muat ulang sebelum menyimpan.", {
      status: 409,
    });
  return { changed: true, version: rows[0].version };
}

export async function validateSchoolNeed(
  request: Request,
  env: Env,
  needId: string,
  input: unknown
) {
  requireOrigin(request, env);
  const access = await getAccess(request, env);
  if (!access.roles.includes("staff"))
    throw new Response("Peran perwakilan staf sekolah diperlukan.", { status: 403 });
  const repository = schoolNeedsRepository(env.DB);
  const visibility = await repository.visibility(needId, access.account.id);
  if (!visibility || visibility.staffContactUserId !== access.account.id)
    throw new Response("Kebutuhan tidak ditemukan.", { status: 404 });
  const body = parseInput(
    schoolNeedApprovalInput,
    input,
    "Versi kebutuhan yang akan divalidasi tidak valid."
  );
  const rows = await repository.approve({
    needId,
    version: body.expectedVersion,
    stage: "staff-validation",
    actorId: access.account.id,
    occurredAt: new Date().toISOString(),
  });
  if (!rows.length)
    throw new Response("Kebutuhan atau peran staf telah berubah. Muat ulang sebelum memvalidasi.", {
      status: 409,
    });
  return { changed: true };
}

export async function approveSchoolNeed(
  request: Request,
  env: Env,
  needId: string,
  input: unknown
) {
  requireOrigin(request, env);
  const access = await getAccess(request, env);
  if (!access.roles.includes("directory-coordinator"))
    throw new Response("Peran koordinator direktori diperlukan.", { status: 403 });
  const body = parseInput(
    schoolNeedApprovalInput,
    input,
    "Versi kebutuhan yang akan disetujui tidak valid."
  );
  const rows = await schoolNeedsRepository(env.DB).approve({
    needId,
    version: body.expectedVersion,
    stage: "directory-approval",
    actorId: access.account.id,
    occurredAt: new Date().toISOString(),
  });
  if (!rows.length)
    throw new Response(
      "Validasi staf, versi kebutuhan, atau kewenangan berubah. Muat ulang sebelum menyetujui.",
      { status: 409 }
    );
  return { changed: true };
}
