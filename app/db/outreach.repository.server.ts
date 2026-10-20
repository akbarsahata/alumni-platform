import { and, asc, count, desc, eq, exists, gt, or, sql } from "drizzle-orm";
import { database } from "./database.server";
import {
  schoolNeed,
  outreachApprovedNeed,
  outreachRequest,
  outreachNotification,
  outreachClosure,
  outreachAudit,
  outreachIntroduction,
  outreachStaffRecipient,
  user,
} from "./schema";
import type { EmailMessage } from "../email/email.server";
import type { OutreachAuditCursor, OutreachStatus } from "../outreach/model";

const needColumns = {
  id: schoolNeed.id,
  version: schoolNeed.version,
  category: schoolNeed.category,
  title: schoolNeed.title,
  purpose: schoolNeed.purpose,
  requestedHelp: schoolNeed.requestedHelp,
  timeCommitment: schoolNeed.timeCommitment,
  timing: schoolNeed.timing,
  deadline: schoolNeed.deadline,
  locationMode: schoolNeed.locationMode,
  locationDetails: schoolNeed.locationDetails,
  staffContactUserId: schoolNeed.staffContactUserId,
  staffContactName: schoolNeed.staffContactName,
  participationTerms: schoolNeed.participationTerms,
  paidDetails: schoolNeed.paidDetails,
  initiativeLink: schoolNeed.initiativeLink,
  createdAt: schoolNeed.createdAt,
  updatedAt: schoolNeed.updatedAt,
};
const requestColumns = {
  id: outreachRequest.id,
  needId: outreachRequest.needId,
  recipientUserId: outreachRequest.recipientUserId,
  coordinatorUserId: outreachRequest.coordinatorUserId,
  sentAt: outreachRequest.sentAt,
  expiresAt: outreachRequest.expiresAt,
  status: sql<OutreachStatus>`CASE WHEN ${outreachRequest.status}='pending' AND julianday(${outreachRequest.expiresAt})<=julianday('now') THEN 'expired' ELSE ${outreachRequest.status} END`,
  declineReason: outreachRequest.declineReason,
  reminderAt: outreachRequest.reminderAt,
};
const sharingColumns = {
  id: outreachIntroduction.id,
  requestId: outreachIntroduction.requestId,
  staffUserId: outreachIntroduction.staffUserId,
  staffName: sql<string>`COALESCE(NULLIF(trim(${user.name}),''),'Akun staf ' || substr(${user.id},1,8))`,
  consentedAt: outreachIntroduction.consentedAt,
  withdrawnAt: outreachIntroduction.withdrawnAt,
  invalidatedAt: outreachIntroduction.invalidatedAt,
  invalidationReason: outreachIntroduction.invalidationReason,
  deliveryState: outreachIntroduction.deliveryState,
  sharedAt: outreachIntroduction.sharedAt,
};
export function outreachRepository(binding: D1Database) {
  const db = database(binding);
  const closedNeed = (needId: string) =>
    db
      .select({ id: outreachClosure.needId })
      .from(outreachClosure)
      .where(eq(outreachClosure.needId, needId))
      .limit(1);
  const requestAccess = (requestId: string, actorId: string) =>
    and(
      eq(outreachRequest.id, requestId),
      sql`(${outreachRequest.recipientUserId}=${actorId} OR EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${actorId} AND role='directory-coordinator'))`
    );
  const staffRecipientColumns = {
    userId: sql<string>`COALESCE(${outreachStaffRecipient.userId},${schoolNeed.staffContactUserId})`,
    name: sql<string>`COALESCE(NULLIF(trim(${user.name}),''),'Akun staf ' || substr(${user.id},1,8))`,
    active: sql<number>`(${user.emailVerified}=1 AND EXISTS(SELECT 1 FROM role_assignment rr WHERE rr.user_id=${user.id} AND rr.role='staff'))`,
  };
  const staffRecipientForNeed = (needId: string) =>
    db
      .select(staffRecipientColumns)
      .from(schoolNeed)
      .leftJoin(outreachStaffRecipient, eq(outreachStaffRecipient.needId, schoolNeed.id))
      .innerJoin(
        user,
        sql`${user.id}=COALESCE(${outreachStaffRecipient.userId},${schoolNeed.staffContactUserId})`
      )
      .where(eq(schoolNeed.id, needId));
  const staffRecipientForRequest = (requestId: string, actorId: string) =>
    db
      .select({
        ...staffRecipientColumns,
        eligible: sql<number>`EXISTS(SELECT 1 FROM outreach_eligible_recipient er
          WHERE er.user_id=${outreachRequest.recipientUserId})`,
      })
      .from(outreachRequest)
      .innerJoin(schoolNeed, eq(schoolNeed.id, outreachRequest.needId))
      .leftJoin(outreachStaffRecipient, eq(outreachStaffRecipient.needId, schoolNeed.id))
      .innerJoin(
        user,
        sql`${user.id}=COALESCE(${outreachStaffRecipient.userId},${schoolNeed.staffContactUserId})`
      )
      .where(requestAccess(requestId, actorId));
  const sharingForRequest = (requestId: string, actorId: string) =>
    db
      .select(sharingColumns)
      .from(outreachIntroduction)
      .innerJoin(user, eq(user.id, outreachIntroduction.staffUserId))
      .innerJoin(outreachRequest, eq(outreachRequest.id, outreachIntroduction.requestId))
      .where(requestAccess(requestId, actorId))
      .orderBy(desc(outreachIntroduction.consentedAt), desc(outreachIntroduction.id));
  const sharingForNeed = (needId: string) =>
    db
      .select(sharingColumns)
      .from(outreachIntroduction)
      .innerJoin(user, eq(user.id, outreachIntroduction.staffUserId))
      .where(eq(outreachIntroduction.needId, needId))
      .orderBy(desc(outreachIntroduction.consentedAt), desc(outreachIntroduction.id));
  const recipientFromRow = (row: { userId: string; name: string; active: number } | undefined) =>
    row ? { userId: row.userId, name: row.name, active: row.active === 1 } : null;
  return {
    async list(actorId: string, coordinator: boolean, needsAfter: string, requestsAfter: string) {
      const requests = db
        .select({ ...requestColumns, title: schoolNeed.title })
        .from(outreachRequest)
        .innerJoin(schoolNeed, eq(schoolNeed.id, outreachRequest.needId))
        .where(
          and(eq(outreachRequest.recipientUserId, actorId), gt(outreachRequest.id, requestsAfter))
        )
        .orderBy(outreachRequest.id)
        .limit(51);
      if (!coordinator) return { needs: [], requests: await requests };
      const needs = db
        .select({ id: schoolNeed.id, title: schoolNeed.title, version: schoolNeed.version })
        .from(schoolNeed)
        .where(
          and(
            gt(schoolNeed.id, needsAfter),
            or(
              exists(
                db
                  .select({ id: outreachApprovedNeed.id })
                  .from(outreachApprovedNeed)
                  .where(eq(outreachApprovedNeed.id, schoolNeed.id))
              ),
              exists(
                db
                  .select({ id: outreachRequest.id })
                  .from(outreachRequest)
                  .where(eq(outreachRequest.needId, schoolNeed.id))
              )
            )
          )
        )
        .orderBy(schoolNeed.id)
        .limit(51);
      const [needRows, requestRows] = await db.batch([needs, requests]);
      return { needs: needRows, requests: requestRows };
    },
    async needWorkspace(needId: string) {
      const [needs, available, frozen, closed, requests, notifications, recipients, sharing] =
        await db.batch([
          db.select(needColumns).from(schoolNeed).where(eq(schoolNeed.id, needId)),
          db
            .select({ id: outreachApprovedNeed.id })
            .from(outreachApprovedNeed)
            .where(eq(outreachApprovedNeed.id, needId))
            .limit(1),
          db
            .select({ id: outreachRequest.id })
            .from(outreachRequest)
            .where(eq(outreachRequest.needId, needId))
            .limit(1),
          closedNeed(needId),
          db
            .select(requestColumns)
            .from(outreachRequest)
            .where(eq(outreachRequest.needId, needId))
            .orderBy(outreachRequest.sentAt, outreachRequest.id),
          db
            .select({
              requestId: outreachNotification.requestId,
              kind: outreachNotification.kind,
              state: outreachNotification.state,
            })
            .from(outreachNotification)
            .innerJoin(outreachRequest, eq(outreachRequest.id, outreachNotification.requestId))
            .where(eq(outreachRequest.needId, needId)),
          staffRecipientForNeed(needId),
          sharingForNeed(needId),
        ]);
      return {
        need: needs[0],
        available: !!available[0],
        frozen: !!frozen[0],
        closed: !!closed[0],
        requests,
        notifications,
        staffRecipient: recipientFromRow(recipients[0]),
        sharing,
      };
    },
    async aggregate(needId: string) {
      const [rows, closures] = await db.batch([
        db
          .select({ status: requestColumns.status, count: count() })
          .from(outreachRequest)
          .where(eq(outreachRequest.needId, needId))
          .groupBy(requestColumns.status),
        closedNeed(needId),
      ]);
      const counts: Record<OutreachStatus, number> = {
        pending: 0,
        interested: 0,
        declined: 0,
        cancelled: 0,
        expired: 0,
      };
      let total = 0;
      for (const row of rows) {
        total += row.count;
        counts[row.status] = row.count;
      }
      return { total, ...counts, closed: !!closures[0] };
    },
    async remind(requestId: string, actorId: string) {
      return db.all<{
        id: string;
      }>(sql`UPDATE outreach_request SET reminder_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_by=${actorId},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=${requestId} AND reminder_at IS NULL AND status='pending'
    AND julianday(sent_at)<=julianday('now','-7 days') AND julianday(expires_at)>julianday('now')
    AND EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=recipient_user_id)
    AND EXISTS(SELECT 1 FROM outreach_approved_need WHERE id=need_id)
    AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${actorId} AND role='directory-coordinator') RETURNING id`);
    },
    async takeOver(requestId: string, actorId: string, expectedCoordinatorId: string) {
      return db.all<{
        id: string;
      }>(sql`UPDATE outreach_request SET coordinator_user_id=${actorId},updated_by=${actorId},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id=${requestId} AND coordinator_user_id=${expectedCoordinatorId} AND coordinator_user_id!=${actorId}
     AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${actorId} AND role='directory-coordinator') RETURNING id`);
    },
    async audit(after: OutreachAuditCursor | null) {
      return db
        .select()
        .from(outreachAudit)
        .where(
          after
            ? or(
                gt(outreachAudit.occurredAt, after.occurredAt),
                and(eq(outreachAudit.occurredAt, after.occurredAt), gt(outreachAudit.id, after.id))
              )
            : undefined
        )
        .orderBy(asc(outreachAudit.occurredAt), asc(outreachAudit.id))
        .limit(51);
    },
    async reconcile() {
      await db.run(sql`UPDATE outreach_request SET status='cancelled',updated_by=recipient_user_id,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE status='pending' AND NOT EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=recipient_user_id)`);
      await db.run(sql`UPDATE outreach_introduction SET invalidated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
        invalidation_reason=CASE WHEN member_email!=(SELECT email FROM user WHERE id=member_user_id)
          THEN 'email-changed' ELSE 'eligibility-changed' END,
        delivery_state='cancelled'
     WHERE delivery_state IN('pending','claimed') AND shared_at IS NULL AND withdrawn_at IS NULL
       AND invalidated_at IS NULL
       AND (member_user_id NOT IN (SELECT user_id FROM outreach_eligible_recipient)
         OR member_email!=(SELECT email FROM user WHERE id=member_user_id))`);
    },
    async close(needId: string, actorId: string) {
      return db.all<{
        needId: string;
      }>(sql`INSERT INTO outreach_closure(need_id,actor_user_id,closed_at)
     SELECT id,${actorId},strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM school_need n WHERE n.id=${needId}
     AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${actorId} AND role='directory-coordinator')
     AND NOT EXISTS(SELECT 1 FROM outreach_closure WHERE need_id=n.id) RETURNING need_id AS needId`);
    },
    async send(input: {
      id: string;
      needId: string;
      version: number;
      recipientId: string;
      actorId: string;
      now: string;
    }) {
      return db.all<{ id: string }>(sql`
    INSERT INTO outreach_request(id,need_id,need_version,recipient_user_id,coordinator_user_id,sent_at,expires_at,updated_by,updated_at)
    SELECT ${input.id},n.id,n.version,${input.recipientId},${input.actorId},${input.now},
      CASE WHEN n.deadline IS NOT NULL AND n.deadline || 'T23:59:59.999Z' < strftime('%Y-%m-%dT%H:%M:%fZ',${input.now},'+14 days')
      THEN n.deadline || 'T23:59:59.999Z' ELSE strftime('%Y-%m-%dT%H:%M:%fZ',${input.now},'+14 days') END,
      ${input.actorId},${input.now}
    FROM school_need n WHERE n.id=${input.needId} AND n.version=${input.version}
    AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${input.actorId} AND role='directory-coordinator')
    AND EXISTS(SELECT 1 FROM outreach_approved_need WHERE id=n.id)
    AND EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=${input.recipientId})
    AND (n.deadline IS NULL OR n.deadline >= substr(${input.now},1,10))
    AND NOT EXISTS(SELECT 1 FROM outreach_request WHERE need_id=n.id AND recipient_user_id=${input.recipientId})
    AND (SELECT count(*) FROM outreach_request WHERE need_id=n.id)<10
    AND (SELECT count(*) FROM outreach_request WHERE recipient_user_id=${input.recipientId}
      AND julianday(sent_at)>julianday(${input.now},'-30 days'))<3
    RETURNING id`);
    },
    async request(requestId: string, actorId: string) {
      return (
        await db
          .select(requestColumns)
          .from(outreachRequest)
          .where(requestAccess(requestId, actorId))
      )[0];
    },
    async requestWithNeed(requestId: string, actorId: string) {
      return (
        await db
          .select({ request: requestColumns, need: needColumns })
          .from(outreachRequest)
          .innerJoin(schoolNeed, eq(schoolNeed.id, outreachRequest.needId))
          .where(requestAccess(requestId, actorId))
      )[0];
    },
    async requestDetail(requestId: string, actorId: string) {
      const [requests, needs, sharing, recipients] = await db.batch([
        db.select(requestColumns).from(outreachRequest).where(requestAccess(requestId, actorId)),
        db
          .select(needColumns)
          .from(outreachRequest)
          .innerJoin(schoolNeed, eq(schoolNeed.id, outreachRequest.needId))
          .where(requestAccess(requestId, actorId)),
        sharingForRequest(requestId, actorId),
        staffRecipientForRequest(requestId, actorId),
      ]);
      if (!requests[0]) return undefined;
      return {
        request: requests[0],
        need: needs[0],
        sharing,
        staffRecipient: recipientFromRow(recipients[0]),
        eligible: recipients[0]?.eligible === 1,
      };
    },
    async respond(input: {
      requestId: string;
      actorId: string;
      outcome: "interested" | "declined";
      reason: string;
      now: string;
    }) {
      return db.all<{
        id: string;
      }>(sql`UPDATE outreach_request SET status=${input.outcome},decline_reason=${input.reason},responded_at=${input.now},updated_by=${input.actorId},updated_at=${input.now}
     WHERE id=${input.requestId} AND recipient_user_id=${input.actorId} AND status='pending' AND expires_at>${input.now}
     AND EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=${input.actorId})
     AND EXISTS(SELECT 1 FROM outreach_approved_need WHERE id=outreach_request.need_id) RETURNING id`);
    },
    async claim(requestId: string, actorId: string) {
      const rows = await db.all<{
        id: string;
        kind: "request" | "reminder";
      }>(sql`UPDATE outreach_notification SET state='claimed'
    WHERE id=(SELECT id FROM outreach_notification WHERE request_id=${requestId} AND state='pending' ORDER BY kind DESC LIMIT 1)
    AND EXISTS(SELECT 1 FROM outreach_request r WHERE r.id=request_id AND r.status='pending'
     AND julianday(r.expires_at)>julianday('now')
     AND EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=r.recipient_user_id)
     AND EXISTS(SELECT 1 FROM outreach_approved_need WHERE id=r.need_id)
     AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${actorId} AND role='directory-coordinator')
     AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=r.coordinator_user_id AND role='directory-coordinator')) RETURNING id,kind`);
      return rows[0];
    },
    async delivery(requestId: string, actorId: string, notificationId: string) {
      return (
        await db.all<{
          email: string;
          title: string;
          expiresAt: string;
        }>(sql`SELECT u.email,n.title,r.expires_at AS expiresAt
    FROM outreach_request r JOIN user u ON u.id=r.recipient_user_id JOIN school_need n ON n.id=r.need_id
    WHERE r.id=${requestId} AND r.status='pending' AND julianday(r.expires_at)>julianday('now')
    AND EXISTS(SELECT 1 FROM outreach_notification WHERE id=${notificationId} AND state='claimed')
    AND EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=r.recipient_user_id)
    AND EXISTS(SELECT 1 FROM outreach_approved_need WHERE id=r.need_id)
    AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${actorId} AND role='directory-coordinator')
    AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=r.coordinator_user_id AND role='directory-coordinator')`)
      )[0];
    },
    async hasPendingNotification(requestId: string) {
      return !!(
        await db
          .select({ id: outreachNotification.id })
          .from(outreachNotification)
          .where(
            and(
              eq(outreachNotification.requestId, requestId),
              sql`${outreachNotification.state} IN('pending','claimed')`
            )
          )
          .limit(1)
      )[0];
    },
    async finishNotification(id: string, state: "pending" | "captured" | "cancelled") {
      await db.run(
        sql`UPDATE outreach_notification SET state=${state} WHERE id=${id} AND state='claimed'`
      );
    },
    async changeStaffRecipient(input: {
      needId: string;
      actorId: string;
      expectedStaffUserId: string;
      staffUserId: string;
      now: string;
    }) {
      return db.all<{ needId: string }>(sql`
        INSERT INTO outreach_staff_recipient(need_id,user_id,assigned_by,assigned_at)
        SELECT n.id,${input.staffUserId},${input.actorId},${input.now}
        FROM school_need n
        WHERE n.id=${input.needId}
          AND EXISTS(SELECT 1 FROM outreach_request r WHERE r.need_id=n.id)
          AND EXISTS(SELECT 1 FROM role_assignment
            WHERE user_id=${input.actorId} AND role='directory-coordinator')
          AND EXISTS(SELECT 1 FROM role_assignment r JOIN user u ON u.id=r.user_id
            WHERE r.user_id=${input.staffUserId} AND r.role='staff' AND u.email_verified=1)
          AND COALESCE((SELECT user_id FROM outreach_staff_recipient WHERE need_id=n.id),
            n.staff_contact_user_id)=${input.expectedStaffUserId}
          AND ${input.staffUserId}!=${input.expectedStaffUserId}
        ON CONFLICT(need_id) DO UPDATE SET user_id=excluded.user_id,
          assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at
          WHERE outreach_staff_recipient.user_id=${input.expectedStaffUserId}
        RETURNING need_id AS needId`);
    },
    async consent(input: {
      id: string;
      requestId: string;
      memberId: string;
      now: string;
      expectedStaffUserId: string;
      expectedMemberEmail: string;
    }) {
      return db.all<{ id: string }>(sql`
        INSERT INTO outreach_introduction(id,need_id,request_id,member_user_id,staff_user_id,
          member_email,consented_at,delivery_state)
        SELECT ${input.id},r.need_id,r.id,r.recipient_user_id,sr.user_id,mu.email,
          ${input.now},'pending'
        FROM outreach_request r
        JOIN outreach_staff_recipient sr ON sr.need_id=r.need_id
        JOIN user mu ON mu.id=r.recipient_user_id
        JOIN role_assignment rr ON rr.user_id=sr.user_id AND rr.role='staff'
        JOIN user su ON su.id=sr.user_id AND su.email_verified=1
        WHERE r.id=${input.requestId} AND r.recipient_user_id=${input.memberId}
          AND r.status='interested' AND r.expires_at>${input.now}
          AND sr.user_id=${input.expectedStaffUserId} AND mu.email=${input.expectedMemberEmail}
          AND EXISTS(SELECT 1 FROM outreach_eligible_recipient er
            WHERE er.user_id=r.recipient_user_id)
          AND NOT EXISTS(SELECT 1 FROM outreach_introduction i
            WHERE i.request_id=r.id AND i.shared_at IS NULL
              AND i.withdrawn_at IS NULL AND i.invalidated_at IS NULL)
          AND NOT EXISTS(SELECT 1 FROM outreach_introduction i
            WHERE i.request_id=r.id AND i.staff_user_id=sr.user_id
              AND i.shared_at IS NOT NULL)
        RETURNING id`);
    },
    async withdraw(requestId: string, memberId: string, now: string) {
      return db.all<{ id: string }>(sql`
        UPDATE outreach_introduction SET withdrawn_at=${now},delivery_state='cancelled'
        WHERE request_id=${requestId} AND member_user_id=${memberId}
          AND delivery_state IN('pending','claimed') AND shared_at IS NULL
          AND withdrawn_at IS NULL AND invalidated_at IS NULL
        RETURNING id`);
    },
    async activeIntroduction(requestId: string, memberId: string) {
      return (
        await db.all<{
          id: string;
          deliveryState: "pending" | "claimed" | "captured" | "cancelled";
          sharedAt: string | null;
        }>(sql`SELECT id,delivery_state AS deliveryState,shared_at AS sharedAt
          FROM outreach_introduction
          WHERE request_id=${requestId} AND member_user_id=${memberId}
            AND withdrawn_at IS NULL AND invalidated_at IS NULL
          ORDER BY consented_at DESC,id DESC LIMIT 1`)
      )[0];
    },
    async claimIntroduction(
      requestId: string,
      now: string,
      initiatingCoordinatorId: string | null
    ) {
      return (
        await db.all<{ id: string }>(sql`
          UPDATE outreach_introduction SET delivery_state='claimed',claimed_at=${now}
          WHERE id=(SELECT i.id FROM outreach_introduction i
            JOIN outreach_request r ON r.id=i.request_id
            JOIN outreach_staff_recipient sr ON sr.need_id=i.need_id
            JOIN user mu ON mu.id=i.member_user_id
            JOIN user su ON su.id=i.staff_user_id
            WHERE i.request_id=${requestId} AND i.delivery_state='pending'
              AND i.shared_at IS NULL AND i.withdrawn_at IS NULL AND i.invalidated_at IS NULL
              AND r.status='interested'
              AND i.consented_at<=r.expires_at
              AND i.member_email=mu.email
              AND i.staff_user_id=sr.user_id
              AND EXISTS(SELECT 1 FROM outreach_eligible_recipient er
                WHERE er.user_id=i.member_user_id)
              AND mu.email_verified=1 AND su.email_verified=1
              AND EXISTS(SELECT 1 FROM role_assignment rr
                WHERE rr.user_id=i.staff_user_id AND rr.role='staff')
              AND (${initiatingCoordinatorId} IS NULL OR EXISTS(
                SELECT 1 FROM role_assignment cr
                WHERE cr.user_id=${initiatingCoordinatorId}
                  AND cr.role='directory-coordinator'))
            ORDER BY i.consented_at DESC,i.id DESC LIMIT 1)
          AND delivery_state='pending'
          RETURNING id`)
      )[0];
    },
    async introductionDelivery(id: string) {
      return (
        await db.all<{
          staffEmail: string;
          staffName: string;
          memberEmail: string;
          memberName: string;
          title: string;
          purpose: string;
          requestedHelp: string;
        }>(sql`
          SELECT su.email AS staffEmail,
            COALESCE(NULLIF(trim(su.name),''),'Akun staf ' || substr(su.id,1,8)) AS staffName,
            i.member_email AS memberEmail,
            COALESCE(NULLIF(trim(p.display_name),''),
              NULLIF(trim((SELECT school_name FROM membership_revision mr
                WHERE mr.user_id=i.member_user_id ORDER BY mr.revision DESC LIMIT 1)),''),
              'Alumni') AS memberName,
            n.title,n.purpose,n.requested_help AS requestedHelp
          FROM outreach_introduction i
          JOIN outreach_request r ON r.id=i.request_id
          JOIN school_need n ON n.id=i.need_id
          JOIN outreach_staff_recipient sr ON sr.need_id=i.need_id
            AND sr.user_id=i.staff_user_id
          JOIN user su ON su.id=i.staff_user_id
          JOIN user mu ON mu.id=i.member_user_id
          LEFT JOIN expertise_profile p ON p.user_id=i.member_user_id
          WHERE i.id=${id} AND i.delivery_state='claimed'
            AND i.shared_at IS NULL AND i.withdrawn_at IS NULL
            AND i.invalidated_at IS NULL
            AND r.status='interested'
            AND i.consented_at<=r.expires_at
            AND i.member_email=mu.email
            AND EXISTS(SELECT 1 FROM outreach_eligible_recipient er
              WHERE er.user_id=i.member_user_id)
            AND mu.email_verified=1 AND su.email_verified=1
            AND EXISTS(SELECT 1 FROM role_assignment rr
              WHERE rr.user_id=i.staff_user_id AND rr.role='staff')`)
      )[0];
    },
    async captureIntroduction(
      id: string,
      message: EmailMessage,
      initiatingCoordinatorId: string | null
    ) {
      const now = Date.now();
      const rows = await db.all<{ recipient: string }>(sql`
        INSERT OR REPLACE INTO local_introduction_mail(
          recipient,introduction_id,message,captured_at,expires_at)
        SELECT lower(su.email),i.id,${JSON.stringify(message)},${now},${now + 600_000}
        FROM outreach_introduction i
        JOIN outreach_request r ON r.id=i.request_id
        JOIN outreach_staff_recipient sr ON sr.need_id=i.need_id AND sr.user_id=i.staff_user_id
        JOIN user mu ON mu.id=i.member_user_id
        JOIN user su ON su.id=i.staff_user_id
        WHERE i.id=${id} AND i.delivery_state='claimed'
          AND i.shared_at IS NULL AND i.withdrawn_at IS NULL AND i.invalidated_at IS NULL
          AND r.status='interested' AND i.consented_at<=r.expires_at
          AND i.member_email=mu.email AND su.email=${message.to}
          AND mu.email_verified=1 AND su.email_verified=1
          AND EXISTS(SELECT 1 FROM outreach_eligible_recipient er WHERE er.user_id=i.member_user_id)
          AND EXISTS(SELECT 1 FROM role_assignment rr WHERE rr.user_id=i.staff_user_id AND rr.role='staff')
          AND (${initiatingCoordinatorId} IS NULL OR EXISTS(
            SELECT 1 FROM role_assignment cr
            WHERE cr.user_id=${initiatingCoordinatorId}
              AND cr.role='directory-coordinator'))
        RETURNING recipient`);
      return rows.length > 0;
    },
    async releaseIntroduction(id: string) {
      return db.all<{ id: string }>(sql`
        UPDATE outreach_introduction SET delivery_state='pending',claimed_at=NULL
        WHERE id=${id} AND delivery_state='claimed' AND shared_at IS NULL
          AND withdrawn_at IS NULL AND invalidated_at IS NULL
        RETURNING id`);
    },
    async hasPendingIntroduction(requestId: string) {
      return !!(
        await db.all<{ id: string }>(sql`
          SELECT id FROM outreach_introduction
          WHERE request_id=${requestId} AND delivery_state='pending'
            AND shared_at IS NULL AND withdrawn_at IS NULL AND invalidated_at IS NULL
          LIMIT 1`)
      )[0];
    },
  };
}
