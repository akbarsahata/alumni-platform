import { alumniMembership, membershipStatusDecision, membershipSuspensionRequest } from "./schema";
import { sql, eq, desc, asc, and, isNull, gt } from "drizzle-orm";
import { database } from "./database.server";

export function suspensionRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async history(userId: string) {
      return db
        .select({
          id: membershipStatusDecision.id,
          version: membershipStatusDecision.version,
          actorUserId: membershipStatusDecision.actorUserId,
          outcome: membershipStatusDecision.outcome,
          reason: membershipStatusDecision.reason,
          applicantMessage: membershipStatusDecision.applicantMessage,
          occurredAt: membershipStatusDecision.occurredAt,
        })
        .from(membershipStatusDecision)
        .where(eq(membershipStatusDecision.userId, userId))
        .orderBy(desc(membershipStatusDecision.version))
        .all();
    },
    async requests(userId: string) {
      return db
        .select()
        .from(membershipSuspensionRequest)
        .where(eq(membershipSuspensionRequest.userId, userId))
        .orderBy(
          desc(membershipSuspensionRequest.requestedAt),
          desc(membershipSuspensionRequest.id)
        )
        .all();
    },
    async queue(after: string) {
      return db
        .select({
          userId: alumniMembership.userId,
          status: alumniMembership.status,
          house: alumniMembership.house,
          requestedAt: membershipSuspensionRequest.requestedAt,
        })
        .from(alumniMembership)
        .leftJoin(
          membershipSuspensionRequest,
          and(
            eq(membershipSuspensionRequest.userId, alumniMembership.userId),
            isNull(membershipSuspensionRequest.resolvedBy)
          )
        )
        .where(gt(alumniMembership.userId, after))
        .orderBy(asc(alumniMembership.userId))
        .limit(101)
        .all();
    },
    async decide(input: {
      id: string;
      userId: string;
      actorId: string;
      expectedVersion: number;
      outcome: "approved" | "suspended";
      reason: string;
      applicantMessage: string;
    }) {
      const result =
        await db.run(sql`INSERT INTO membership_status_decision(id,user_id,version,actor_user_id,outcome,reason,applicant_message)
      SELECT ${input.id},m.user_id,${input.expectedVersion + 1},${input.actorId},${input.outcome},${input.reason},${input.applicantMessage}
      FROM alumni_membership m WHERE m.user_id=${input.userId} AND m.status != ${input.outcome}
      AND (SELECT count(*) FROM membership_status_decision WHERE user_id=m.user_id)=${input.expectedVersion}
      AND ${input.actorId} != m.user_id
      AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${input.actorId} AND role='membership-administrator')
      AND NOT EXISTS(SELECT 1 FROM membership_reference q JOIN membership_reference_response s ON s.request_id=q.id
      WHERE q.user_id=m.user_id AND s.actor_user_id=${input.actorId} AND s.outcome='endorse')`);
      return result.meta.changes > 0;
    },
    async request(input: {
      id: string;
      userId: string;
      suspensionId: string;
      explanation: string;
    }) {
      const result =
        await db.run(sql`INSERT INTO membership_suspension_request(id,user_id,suspension_id,explanation)
      SELECT ${input.id},m.user_id,d.id,${input.explanation} FROM alumni_membership m JOIN membership_status_decision d ON d.user_id=m.user_id
      WHERE m.user_id=${input.userId} AND m.status='suspended' AND d.id=${input.suspensionId} AND d.outcome='suspended'
      AND d.version=(SELECT max(version) FROM membership_status_decision WHERE user_id=m.user_id)
      AND NOT EXISTS(SELECT 1 FROM membership_suspension_request WHERE suspension_id=d.id)
      AND NOT EXISTS(SELECT 1 FROM membership_suspension_request WHERE user_id=m.user_id AND resolved_by IS NULL)`);
      return result.meta.changes > 0;
    },
  };
}
