import { and, asc, count, eq, exists, gt, or, sql } from "drizzle-orm";
import { database } from "./database.server";
import {
  schoolNeed,
  outreachApprovedNeed,
  outreachRequest,
  outreachNotification,
  outreachClosure,
  outreachAudit,
} from "./schema";
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
      const [needs, available, frozen, closed, requests, notifications] = await db.batch([
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
      ]);
      return {
        need: needs[0],
        available: !!available[0],
        frozen: !!frozen[0],
        closed: !!closed[0],
        requests,
        notifications,
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
  };
}
