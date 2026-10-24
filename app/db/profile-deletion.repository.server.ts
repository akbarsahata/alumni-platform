import { sql } from "drizzle-orm";
import { database } from "./database.server";

type RequestRow = {
  id: string;
  memberUserId: string;
  requestedAt: string;
  dueAt: string;
  status: "active" | "completed";
  profileRemovedAt: string | null;
  profileRemovedBy: string | null;
  profileRemovalCount: number | null;
  clarificationRemovedAt: string | null;
  clarificationRemovedBy: string | null;
  clarificationRemovalCount: number | null;
  completedAt: string | null;
  completedBy: string | null;
  completionNote: string | null;
};

type IdentityRow = RequestRow & {
  schoolName: string | null;
  house: string | null;
  profileExists: number;
};

type EventRow = {
  id: string;
  requestId: string;
  actorUserId: string;
  action: "requested" | "profile-removed" | "clarification-removed" | "completed";
  count: number | null;
  note: string | null;
  occurredAt: string;
};

const requestColumns = `d.id, d.member_user_id AS memberUserId, d.requested_at AS requestedAt,
 d.due_at AS dueAt, d.status, d.profile_removed_at AS profileRemovedAt,
 d.profile_removed_by AS profileRemovedBy, d.profile_removal_count AS profileRemovalCount,
 d.clarification_removed_at AS clarificationRemovedAt,
 d.clarification_removed_by AS clarificationRemovedBy,
 d.clarification_removal_count AS clarificationRemovalCount,
 d.completed_at AS completedAt, d.completed_by AS completedBy,
 d.completion_note AS completionNote`;

export function profileDeletionRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async profileExists(userId: string) {
      return !!(await db.get<{ found: number }>(
        sql`SELECT 1 AS found FROM expertise_profile WHERE user_id=${userId}`
      ));
    },
    async latestForMember(userId: string) {
      return (
        (await db.get<RequestRow>(
          sql`SELECT ${sql.raw(requestColumns)} FROM profile_deletion_request d
           WHERE d.member_user_id=${userId}
           ORDER BY d.requested_at DESC, d.id DESC LIMIT 1`
        )) ?? null
      );
    },
    async detail(requestId: string) {
      const [request, events] = await Promise.all([
        db.get<IdentityRow>(
          sql`SELECT ${sql.raw(requestColumns)}, mr.school_name AS schoolName, m.house,
           EXISTS(SELECT 1 FROM expertise_profile p WHERE p.user_id=d.member_user_id) AS profileExists
           FROM profile_deletion_request d
           LEFT JOIN membership_application a ON a.user_id=d.member_user_id
           LEFT JOIN membership_revision mr
             ON mr.user_id=a.user_id AND mr.revision=a.revision
           LEFT JOIN alumni_membership m ON m.user_id=d.member_user_id
           WHERE d.id=${requestId}`
        ),
        db.all<EventRow>(
          sql`SELECT id, request_id AS requestId, actor_user_id AS actorUserId, action,
           count, note, occurred_at AS occurredAt
           FROM profile_deletion_event WHERE request_id=${requestId}
           ORDER BY occurred_at, rowid`
        ),
      ]);
      return request ? { request, events } : null;
    },
    async queue() {
      const [active, completed] = await Promise.all([
        db.all<IdentityRow>(
          sql`SELECT ${sql.raw(requestColumns)}, mr.school_name AS schoolName, m.house,
           EXISTS(SELECT 1 FROM expertise_profile p WHERE p.user_id=d.member_user_id) AS profileExists
           FROM profile_deletion_request d
           LEFT JOIN membership_application a ON a.user_id=d.member_user_id
           LEFT JOIN membership_revision mr
             ON mr.user_id=a.user_id AND mr.revision=a.revision
           LEFT JOIN alumni_membership m ON m.user_id=d.member_user_id
           WHERE d.status='active'
           ORDER BY d.due_at, d.requested_at, d.id`
        ),
        db.all<IdentityRow>(
          sql`SELECT ${sql.raw(requestColumns)}, mr.school_name AS schoolName, m.house,
           EXISTS(SELECT 1 FROM expertise_profile p WHERE p.user_id=d.member_user_id) AS profileExists
           FROM profile_deletion_request d
           LEFT JOIN membership_application a ON a.user_id=d.member_user_id
           LEFT JOIN membership_revision mr
             ON mr.user_id=a.user_id AND mr.revision=a.revision
           LEFT JOIN alumni_membership m ON m.user_id=d.member_user_id
           WHERE d.status='completed'
           ORDER BY d.completed_at DESC, d.id DESC LIMIT 50`
        ),
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

export type ProfileDeletionRequestRow = RequestRow;
export type ProfileDeletionEventRow = EventRow;
