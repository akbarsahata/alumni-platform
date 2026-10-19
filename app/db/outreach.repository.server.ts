import { and, gt, eq, sql } from "drizzle-orm";
import { database } from "./database.server";
import {
  schoolNeed,
  outreachRequest,
  outreachNotification,
  outreachClosure,
  outreachAudit,
} from "./schema";

const requestColumns = {
  id: outreachRequest.id,
  needId: outreachRequest.needId,
  recipientUserId: outreachRequest.recipientUserId,
  coordinatorUserId: outreachRequest.coordinatorUserId,
  sentAt: outreachRequest.sentAt,
  expiresAt: outreachRequest.expiresAt,
  status: sql<string>`CASE WHEN ${outreachRequest.status}='pending' AND julianday(${outreachRequest.expiresAt})<=julianday('now') THEN 'expired' ELSE ${outreachRequest.status} END`,
  declineReason: outreachRequest.declineReason,
  reminderAt: outreachRequest.reminderAt,
};
export type OutreachRequest = {
  id: string;
  needId: string;
  recipientUserId: string;
  coordinatorUserId: string;
  sentAt: string;
  expiresAt: string;
  status: string;
  declineReason: string;
  reminderAt: string | null;
};
export function outreachRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async list(actorId: string, coordinator: boolean, after: string) {
      const needs = coordinator
        ? await db
            .select({ id: schoolNeed.id, title: schoolNeed.title, version: schoolNeed.version })
            .from(schoolNeed)
            .where(
              sql`${schoolNeed.id}>${after} AND (EXISTS(SELECT 1 FROM outreach_approved_need WHERE id=${schoolNeed.id}) OR EXISTS(SELECT 1 FROM outreach_request WHERE need_id=${schoolNeed.id}))`
            )
            .orderBy(schoolNeed.id)
            .limit(51)
        : [];
      const requests = await db
        .select({ ...requestColumns, title: schoolNeed.title })
        .from(outreachRequest)
        .innerJoin(schoolNeed, eq(schoolNeed.id, outreachRequest.needId))
        .where(and(eq(outreachRequest.recipientUserId, actorId), gt(outreachRequest.id, after)))
        .orderBy(outreachRequest.id)
        .limit(51);
      return { needs, requests };
    },
    async available(needId: string) {
      return !!(await db.get(sql`SELECT id FROM outreach_approved_need WHERE id=${needId}`));
    },
    async notifications(needId: string) {
      return db
        .select({
          requestId: outreachNotification.requestId,
          kind: outreachNotification.kind,
          state: outreachNotification.state,
        })
        .from(outreachNotification)
        .innerJoin(outreachRequest, eq(outreachRequest.id, outreachNotification.requestId))
        .where(eq(outreachRequest.needId, needId));
    },
    async aggregate(needId: string) {
      await this.reconcile();
      const rows = await db.all<{ status: string; count: number }>(
        sql`SELECT CASE WHEN status='pending' AND julianday(expires_at)<=julianday('now') THEN 'expired' ELSE status END AS status,count(*) AS count FROM outreach_request WHERE need_id=${needId} GROUP BY 1`
      );
      const counts = {
        total: 0,
        pending: 0,
        interested: 0,
        declined: 0,
        cancelled: 0,
        expired: 0,
        closed: await this.closed(needId),
      };
      for (const row of rows) {
        counts.total += row.count;
        if (
          row.status === "pending" ||
          row.status === "interested" ||
          row.status === "declined" ||
          row.status === "cancelled" ||
          row.status === "expired"
        )
          counts[row.status] = row.count;
      }
      return counts;
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
    async audit(after: string) {
      return db
        .select()
        .from(outreachAudit)
        .where(gt(outreachAudit.id, after))
        .orderBy(outreachAudit.id)
        .limit(51);
    },
    async reconcile() {
      await db.run(sql`UPDATE outreach_request SET status='cancelled',updated_by=recipient_user_id,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE status='pending' AND NOT EXISTS(SELECT 1 FROM outreach_eligible_recipient WHERE user_id=recipient_user_id)`);
    },
    async closed(needId: string) {
      return !!(
        await db
          .select({ id: outreachClosure.needId })
          .from(outreachClosure)
          .where(eq(outreachClosure.needId, needId))
          .limit(1)
      )[0];
    },
    async frozen(needId: string) {
      return !!(
        await db
          .select({ id: outreachRequest.id })
          .from(outreachRequest)
          .where(eq(outreachRequest.needId, needId))
          .limit(1)
      )[0];
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
    async need(needId: string) {
      return (await db.select().from(schoolNeed).where(eq(schoolNeed.id, needId)))[0];
    },
    async requests(needId: string) {
      return db
        .select(requestColumns)
        .from(outreachRequest)
        .where(eq(outreachRequest.needId, needId))
        .orderBy(outreachRequest.sentAt, outreachRequest.id);
    },
    async request(requestId: string, actorId: string) {
      return (
        await db
          .select(requestColumns)
          .from(outreachRequest)
          .where(
            and(
              eq(outreachRequest.id, requestId),
              sql`(${outreachRequest.recipientUserId}=${actorId} OR EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${actorId} AND role='directory-coordinator'))`
            )
          )
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
    async pending(requestId: string) {
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
