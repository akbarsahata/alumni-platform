import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { database } from "./database.server";
import {
  alumniMembership,
  expertiseProfile,
  membershipApplication,
  membershipRevision,
  profileDeletionEvent,
  profileDeletionRequest,
} from "./schema";

export type ProfileDeletionRequestRow = typeof profileDeletionRequest.$inferSelect;
export type ProfileDeletionEventRow = typeof profileDeletionEvent.$inferSelect;

const identityColumns = {
  ...getTableColumns(profileDeletionRequest),
  schoolName: membershipRevision.schoolName,
  house: alumniMembership.house,
  profileExists: sql<number>`EXISTS(SELECT 1 FROM expertise_profile p
   WHERE p.user_id=${profileDeletionRequest.memberUserId})`,
};

export function profileDeletionRepository(binding: D1Database) {
  const db = database(binding);
  const identityRows = () =>
    db
      .select(identityColumns)
      .from(profileDeletionRequest)
      .leftJoin(
        membershipApplication,
        eq(membershipApplication.userId, profileDeletionRequest.memberUserId)
      )
      .leftJoin(
        membershipRevision,
        and(
          eq(membershipRevision.userId, membershipApplication.userId),
          eq(membershipRevision.revision, membershipApplication.revision)
        )
      )
      .leftJoin(alumniMembership, eq(alumniMembership.userId, profileDeletionRequest.memberUserId));
  return {
    async profileExists(userId: string) {
      return !!(
        await db
          .select({ userId: expertiseProfile.userId })
          .from(expertiseProfile)
          .where(eq(expertiseProfile.userId, userId))
          .limit(1)
      )[0];
    },
    async latestForMember(userId: string) {
      return (
        (
          await db
            .select()
            .from(profileDeletionRequest)
            .where(eq(profileDeletionRequest.memberUserId, userId))
            .orderBy(desc(profileDeletionRequest.requestedAt), desc(profileDeletionRequest.id))
            .limit(1)
        )[0] ?? null
      );
    },
    async detail(requestId: string) {
      const [requests, events] = await Promise.all([
        identityRows().where(eq(profileDeletionRequest.id, requestId)),
        db
          .select({
            id: profileDeletionEvent.id,
            requestId: profileDeletionEvent.requestId,
            actorUserId: profileDeletionEvent.actorUserId,
            action: profileDeletionEvent.action,
            count: profileDeletionEvent.count,
            note: profileDeletionEvent.note,
            occurredAt: profileDeletionEvent.occurredAt,
          })
          .from(profileDeletionEvent)
          .where(eq(profileDeletionEvent.requestId, requestId))
          .orderBy(asc(profileDeletionEvent.occurredAt), asc(profileDeletionEvent.id)),
      ]);
      return requests[0] ? { request: requests[0], events } : null;
    },
    async queue() {
      const [active, completed] = await Promise.all([
        identityRows()
          .where(eq(profileDeletionRequest.status, "active"))
          .orderBy(
            asc(profileDeletionRequest.dueAt),
            asc(profileDeletionRequest.requestedAt),
            asc(profileDeletionRequest.id)
          ),
        identityRows()
          .where(eq(profileDeletionRequest.status, "completed"))
          .orderBy(desc(profileDeletionRequest.completedAt), desc(profileDeletionRequest.id))
          .limit(50),
      ]);
      return { active, completed };
    },
    async create(input: { id: string; memberId: string; requestedAt: string; dueAt: string }) {
      // The conditional insert and partial unique index serialize retries and
      // concurrent submissions. The request trigger sets the profile marker and
      // appends the initial requested event in the same statement.
      const inserted = await db.run(sql`
        INSERT INTO profile_deletion_request(id,member_user_id,requested_at,due_at,status)
        SELECT ${input.id},${input.memberId},${input.requestedAt},${input.dueAt},'active'
        WHERE EXISTS(SELECT 1 FROM expertise_profile WHERE user_id=${input.memberId})
        AND NOT EXISTS(SELECT 1 FROM profile_deletion_request
          WHERE member_user_id=${input.memberId} AND status='active')`);
      return inserted.meta.changes > 0;
    },
    async removeProfile(input: {
      id: string;
      requestId: string;
      actorId: string;
      occurredAt: string;
    }) {
      const result = await db.run(sql`
        INSERT INTO profile_deletion_event(id,request_id,actor_user_id,action,count,occurred_at)
        SELECT ${input.id},r.id,${input.actorId},'profile-removed',
          (SELECT COUNT(*) FROM expertise_profile p WHERE p.user_id=r.member_user_id),
          ${input.occurredAt}
        FROM profile_deletion_request r
        WHERE r.id=${input.requestId} AND r.status='active'
          AND r.profile_removed_at IS NULL
          AND EXISTS(SELECT 1 FROM organization_bootstrap b
            JOIN user u ON u.id=b.primary_user_id
            WHERE b.primary_user_id=${input.actorId} AND u.email_verified=1)`);
      return result.meta.changes > 0;
    },
    async removeClarification(input: {
      id: string;
      requestId: string;
      actorId: string;
      occurredAt: string;
    }) {
      const result = await db.run(sql`
        INSERT INTO profile_deletion_event(id,request_id,actor_user_id,action,count,occurred_at)
        SELECT ${input.id},r.id,${input.actorId},'clarification-removed',
          (SELECT COUNT(*) FROM outreach_clarification c
            JOIN outreach_request o ON o.id=c.request_id
            WHERE o.recipient_user_id=r.member_user_id),
          ${input.occurredAt}
        FROM profile_deletion_request r
        WHERE r.id=${input.requestId} AND r.status='active'
          AND r.clarification_removed_at IS NULL
          AND EXISTS(SELECT 1 FROM organization_bootstrap b
            JOIN user u ON u.id=b.primary_user_id
            WHERE b.primary_user_id=${input.actorId} AND u.email_verified=1)`);
      return result.meta.changes > 0;
    },
    async complete(input: {
      id: string;
      requestId: string;
      actorId: string;
      note: string;
      occurredAt: string;
    }) {
      const result = await db.run(sql`
        INSERT INTO profile_deletion_event(id,request_id,actor_user_id,action,note,occurred_at)
        SELECT ${input.id},r.id,${input.actorId},'completed',${input.note},${input.occurredAt}
        FROM profile_deletion_request r
        WHERE r.id=${input.requestId} AND r.status='active'
          AND r.profile_removed_at IS NOT NULL
          AND r.clarification_removed_at IS NOT NULL
          AND r.completed_at IS NULL
          AND length(trim(${input.note})) BETWEEN 1 AND 1000
          AND ${input.note}=trim(${input.note})
          AND EXISTS(SELECT 1 FROM organization_bootstrap b
            JOIN user u ON u.id=b.primary_user_id
            WHERE b.primary_user_id=${input.actorId} AND u.email_verified=1)`);
      return result.meta.changes > 0;
    },
  };
}
