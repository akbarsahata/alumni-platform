import { getAccess } from "../authorization/permissions.server";
import { hasTrustedOrigin } from "../auth/auth.server";
import { houses, type Application, type Revision, type Decision } from "./model";
import { captureNotifications } from "./notifications.server";

function invalid(message = "Isi identitas sekolah, satu house, dan penjelasan yang valid."): never {
  throw new Response(message, { status: 400 });
}
function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  return input as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) invalid();
  return value.trim();
}
function integer(value: unknown, min: number, max: number) {
  if ((typeof value !== "number" && typeof value !== "string") || value === "") invalid();
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) invalid();
  return result;
}

export async function readApplication(env: Env, userId: string) {
  // Callers authorize ownership/reviewer access before selecting private fields.
  const results = await env.DB.batch([
    env.DB.prepare(
      `SELECT user_id AS userId,revision,status,updated_at AS updatedAt
      FROM membership_application WHERE user_id = ?`
    ).bind(userId),
    env.DB.prepare(
      `SELECT revision,school_name AS schoolName,student_type AS studentType,
      graduation_year AS graduationYear,attendance_start AS attendanceStart,attendance_end AS attendanceEnd,
      house,explanation,submitted_at AS submittedAt FROM membership_revision WHERE user_id = ? ORDER BY revision DESC`
    ).bind(userId),
    env.DB.prepare(
      `SELECT revision,outcome,applicant_message AS applicantMessage,occurred_at AS occurredAt
      FROM membership_decision WHERE user_id = ? ORDER BY revision DESC`
    ).bind(userId),
  ]);
  return {
    application: (results[0].results[0] as Application | undefined) ?? null,
    revisions: results[1].results as Revision[],
    decisions: results[2].results as Pick<
      Decision,
      "revision" | "outcome" | "applicantMessage" | "occurredAt"
    >[],
  };
}

export async function submitApplication(request: Request, env: Env, input: unknown) {
  if (!hasTrustedOrigin(request, env))
    throw new Response("Permintaan tidak diizinkan.", { status: 403 });
  const { account } = await getAccess(request, env);
  const body = record(input);
  const schoolName = text(body.schoolName, 200);
  const explanation = text(body.explanation, 1000);
  const expected = integer(body.expectedRevision, 0, Number.MAX_SAFE_INTEGER - 1);
  if (typeof body.house !== "string" || !houses.some((house) => house === body.house)) invalid();
  if (body.studentType !== "graduate" && body.studentType !== "former-student") invalid();
  const currentYear = new Date().getUTCFullYear();
  const graduate = body.studentType === "graduate";
  const graduationYear = graduate ? integer(body.graduationYear, 1900, currentYear) : null;
  const attendanceStart = graduate ? null : integer(body.attendanceStart, 1900, currentYear);
  const attendanceEnd = graduate
    ? null
    : integer(body.attendanceEnd, attendanceStart!, currentYear);
  if (graduate ? !!body.attendanceStart || !!body.attendanceEnd : !!body.graduationYear) invalid();
  const result = await env.DB.prepare(
    `INSERT INTO membership_revision
    (user_id,revision,school_name,student_type,graduation_year,attendance_start,attendance_end,house,explanation)
    SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM alumni_membership WHERE user_id = ?)
    AND COALESCE((SELECT revision FROM membership_application WHERE user_id = ?),0) = ?
    AND NOT EXISTS (SELECT 1 FROM membership_application WHERE user_id = ? AND status = 'approved')`
  )
    .bind(
      account.id,
      expected + 1,
      schoolName,
      body.studentType,
      graduationYear,
      attendanceStart,
      attendanceEnd,
      body.house,
      explanation,
      account.id,
      account.id,
      expected,
      account.id
    )
    .run();
  const notification = await captureNotifications(env, account.id);
  if (!result.meta.changes)
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
  if (after.length > 200) invalid("Kursor tidak valid.");
  const rows = await env.DB.prepare(
    `SELECT a.user_id AS userId,a.revision,a.status,a.updated_at AS updatedAt,
    r.school_name AS schoolName,r.house FROM membership_application a JOIN membership_revision r
    ON a.user_id = r.user_id AND a.revision = r.revision
    WHERE a.status = 'pending' AND a.user_id > ? ORDER BY a.user_id LIMIT 101`
  )
    .bind(after)
    .all<Application & { schoolName: string; house: string }>();
  return {
    applications: rows.results.slice(0, 100),
    nextCursor: rows.results.length > 100 ? rows.results[99].userId : null,
  };
}

export async function reviewDetails(request: Request, env: Env, userId: string) {
  await requireReviewer(request, env);
  const details = await readApplication(env, userId);
  if (!details.application) throw new Response("Pengajuan tidak ditemukan.", { status: 404 });
  const history = await env.DB.prepare(
    `SELECT id,revision,actor_user_id AS actorUserId,outcome,
    reason,applicant_message AS applicantMessage,check_source AS checkSource,check_note AS checkNote,occurred_at AS occurredAt
    FROM membership_decision WHERE user_id = ? ORDER BY revision DESC`
  )
    .bind(userId)
    .all<Decision>();
  return { ...details, application: details.application, decisions: history.results };
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
  const body = record(input);
  const expected = integer(body.expectedRevision, 1, Number.MAX_SAFE_INTEGER);
  const reason = text(body.reason, 1000);
  const applicantMessage = text(body.applicantMessage, 1000);
  if (
    typeof body.outcome !== "string" ||
    !["approved", "rejected", "action-required"].includes(body.outcome)
  )
    invalid("Pilih keputusan yang valid.");
  const actionRequired = body.outcome === "action-required";
  if (
    !actionRequired &&
    body.checkSource !== "trusted-alumnus" &&
    body.checkSource !== "school-staff"
  )
    invalid("Catat pemeriksaan independen melalui alumni tepercaya atau staf sekolah.");
  const checkNote = actionRequired ? null : text(body.checkNote, 1000);
  const result = await env.DB.prepare(
    `INSERT INTO membership_decision
    (id,user_id,revision,actor_user_id,outcome,reason,applicant_message,check_source,check_note)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM role_assignment WHERE user_id = ? AND role = 'membership-administrator')
    AND EXISTS (SELECT 1 FROM membership_application WHERE user_id = ? AND revision = ? AND status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM alumni_membership WHERE user_id = ?)`
  )
    .bind(
      crypto.randomUUID(),
      userId,
      expected,
      account.id,
      body.outcome,
      reason,
      applicantMessage,
      actionRequired ? null : body.checkSource,
      checkNote,
      account.id,
      userId,
      expected,
      userId
    )
    .run();
  const notification = await captureNotifications(env, userId);
  if (!result.meta.changes)
    throw new Response("Pengajuan atau kewenangan telah berubah. Muat ulang sebelum meninjau.", {
      status: 409,
    });
  return { changed: true, ...notification };
}

export async function handleMembership(request: Request, env: Env) {
  const path = new URL(request.url).pathname;
  const review = path.match(/^\/api\/membership\/reviews\/([^/]+)$/);
  if (path !== "/api/membership/application" && path !== "/api/membership/reviews" && !review)
    return new Response(null, { status: 404 });
  try {
    let value;
    if (review) {
      const userId = decodeURIComponent(review[1]);
      if (request.method === "GET") value = await reviewDetails(request, env, userId);
      else if (request.method === "POST")
        value = await decideApplication(
          request,
          env,
          userId,
          await request.json().catch(() => null)
        );
      else return new Response(null, { status: 405 });
    } else if (path === "/api/membership/reviews") {
      if (request.method !== "GET") return new Response(null, { status: 405 });
      value = await reviewQueue(request, env);
    } else if (request.method === "GET") {
      const { account } = await getAccess(request, env);
      value = await readApplication(env, account.id);
    } else if (request.method === "POST") {
      value = await submitApplication(request, env, await request.json().catch(() => null));
    } else return new Response(null, { status: 405 });
    return Response.json(value, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (!(error instanceof Response)) throw error;
    error.headers.set("Cache-Control", "no-store");
    return error;
  }
}
