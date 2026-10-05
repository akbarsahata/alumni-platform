import { eq, sql } from "drizzle-orm";
import { database } from "./database.server";
import { membershipReference } from "./schema";

export function referenceRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async recover(input: {
      id: string;
      userId: string;
      revision: number;
      email: string | null;
      explanation: string | null;
    }) {
      const result =
        await db.run(sql`INSERT INTO membership_recovery(id,user_id,revision,email,explanation)
      SELECT ${input.id},r.user_id,r.revision,${input.email},COALESCE(${input.explanation},r.explanation)
      FROM membership_application a JOIN membership_revision r ON r.user_id=a.user_id AND r.revision=a.revision
      WHERE a.user_id=${input.userId} AND a.revision=${input.revision} AND a.status='pending'
      AND r.student_type='graduate'
      AND EXISTS(SELECT 1 FROM membership_reference WHERE user_id=a.user_id AND revision=a.revision)
      AND NOT EXISTS(SELECT 1 FROM alumni_membership WHERE user_id=a.user_id)`);
      return result.meta.changes > 0;
    },
    async recipientView(input: { actorId: string; id: string }) {
      return (
        (await db.get<
          | {
              schoolName: string;
              graduationYear: number;
              house: string;
              expiresAt: string;
              answered: string | null;
              current: number;
              eligible: number;
            }
          | undefined
        >(sql`SELECT r.school_name AS schoolName,r.graduation_year AS graduationYear,r.house,
    q.expires_at AS expiresAt,s.request_id AS answered,
    CASE WHEN a.revision = q.revision AND a.status = 'pending' AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END AS current,
    CASE WHEN m.status = 'approved' AND m.house = r.house AND u.id != q.user_id THEN 1 ELSE 0 END AS eligible
    FROM membership_reference q JOIN membership_revision r ON r.user_id = q.user_id AND r.revision = q.revision
    JOIN membership_application a ON a.user_id = q.user_id
    JOIN user u ON u.id = ${input.actorId} AND lower(u.email) = q.to_email AND u.email_verified = 1
    LEFT JOIN alumni_membership m ON m.user_id = u.id
    LEFT JOIN membership_reference_response s ON s.request_id = q.id WHERE q.id = ${input.id}`)) ??
        null
      );
    },
    async insertResponse(input: {
      id: string;
      actorId: string;
      outcome: "endorse" | "decline" | "cannot-confirm";
      known: number;
      comment: string;
    }) {
      const result =
        await db.run(sql`INSERT INTO membership_reference_response(request_id,actor_user_id,outcome,personally_known,comment)
    SELECT ${input.id},${input.actorId},${input.outcome},${input.known},${input.comment} WHERE EXISTS(SELECT 1 FROM membership_reference q JOIN membership_application a
    ON a.user_id = q.user_id AND a.revision = q.revision JOIN membership_revision r ON r.user_id = a.user_id AND r.revision = a.revision
    JOIN user u ON u.id = ${input.actorId} AND u.email_verified = 1 AND lower(u.email) = q.to_email
    JOIN alumni_membership m ON m.user_id = u.id AND m.status = 'approved' AND m.house = r.house
    WHERE q.id = ${input.id} AND u.id != q.user_id AND a.status = 'pending' AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    AND NOT EXISTS(SELECT 1 FROM membership_reference_response WHERE request_id = ${input.id})`);
      return result.meta.changes > 0;
    },
    async requestOwner(input: { id: string }) {
      return (
        (await db
          .select({ userId: membershipReference.userId })
          .from(membershipReference)
          .where(eq(membershipReference.id, input.id))
          .get()) ?? null
      );
    },
    async history(input: { userId: string }) {
      return db.all<{
        revision: number;
        email: string;
        requestedAt: string;
        expiresAt: string;
        actorUserId: string | null;
        outcome: "endorse" | "decline" | "cannot-confirm" | null;
        personallyKnown: number | null;
        comment: string | null;
        occurredAt: string | null;
      }>(sql`SELECT q.revision,q.to_email AS email,q.requested_at AS requestedAt,q.expires_at AS expiresAt,
    s.actor_user_id AS actorUserId,s.outcome,s.personally_known AS personallyKnown,s.comment,s.occurred_at AS occurredAt
    FROM membership_reference q LEFT JOIN membership_reference_response s ON s.request_id = q.id
    WHERE q.user_id = ${input.userId} ORDER BY q.revision DESC`);
    },
    async status(input: { userId: string; revision: number }) {
      return (
        (await db.get<
          { outcome: string | null; expiresAt: string } | undefined
        >(sql`SELECT s.outcome,q.expires_at AS expiresAt FROM membership_reference q
    LEFT JOIN membership_reference_response s ON s.request_id = q.id WHERE q.user_id = ${input.userId} AND q.revision = ${input.revision}`)) ??
        null
      );
    },
    async pendingCapture(input: { userId: string; revision: number }) {
      return (
        (await db.get<{ id: string; email: string } | undefined>(
          sql`SELECT id,to_email AS email FROM membership_reference WHERE user_id = ${input.userId} AND revision = ${input.revision} AND delivered_at IS NULL`
        )) ?? null
      );
    },
    async markCaptured(input: { id: string }) {
      const result = await db
        .update(membershipReference)
        .set({ deliveredAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')` })
        .where(eq(membershipReference.id, input.id))
        .run();
      return result.meta.changes > 0;
    },
    async insertRequest(input: { id: string; userId: string; revision: number; email: string }) {
      const result = await db.run(sql`INSERT INTO membership_reference(id,user_id,revision,to_email)
    SELECT ${input.id},${input.userId},${input.revision},${input.email} WHERE EXISTS(SELECT 1 FROM membership_application a JOIN membership_revision r ON r.user_id = a.user_id AND r.revision = a.revision
    WHERE a.user_id = ${input.userId} AND a.revision = ${input.revision} AND a.status = 'pending' AND r.student_type = 'graduate')
    AND NOT EXISTS(SELECT 1 FROM alumni_membership WHERE user_id = ${input.userId})
    AND NOT EXISTS(SELECT 1 FROM membership_reference WHERE user_id = ${input.userId} AND revision = ${input.revision})`);
      return result.meta.changes > 0;
    },
    async currentRequest(input: { userId: string; revision: number; email: string }) {
      return (
        (await db.get<
          { id: string } | undefined
        >(sql`SELECT q.id FROM membership_reference q JOIN membership_application a
      ON a.user_id = q.user_id AND a.revision = q.revision
      WHERE q.user_id = ${input.userId} AND q.revision = ${input.revision} AND q.to_email = ${input.email} AND a.status = 'pending'
      AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS(SELECT 1 FROM membership_reference_response WHERE request_id = q.id)`)) ?? null
      );
    },
  };
}
