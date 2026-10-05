import { eq, desc, sql } from "drizzle-orm";
import { database } from "./database.server";
import { membershipApplication, membershipRevision, membershipDecision } from "./schema";
import type { Application, Decision } from "../membership/model";

export function membershipRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async membership(userId: string) {
      return db.get<{ status: "approved" | "suspended"; house: string }>(
        sql`SELECT status,house FROM alumni_membership WHERE user_id=${userId}`
      );
    },
    async correctHouse(input: {
      id: string;
      userId: string;
      actorId: string;
      revision: number;
      house: string;
      reason: string;
      applicantMessage: string;
      checkSource: string;
      checkNote: string;
    }) {
      const result =
        await db.run(sql`INSERT INTO membership_house_correction(id,user_id,revision,actor_user_id,old_house,house,reason,applicant_message,check_source,check_note)
      SELECT ${input.id},m.user_id,${input.revision},${input.actorId},m.house,${input.house},${input.reason},${input.applicantMessage},${input.checkSource},${input.checkNote}
      FROM alumni_membership m LEFT JOIN membership_application a ON a.user_id=m.user_id
      WHERE m.user_id=${input.userId}
      AND ((a.revision=${input.revision} AND a.status='approved') OR (a.user_id IS NULL AND ${input.revision}=(SELECT count(*) FROM membership_house_correction WHERE user_id=m.user_id)))
      AND m.status='approved' AND m.house != ${input.house}
      AND ${input.actorId} != m.user_id
      AND EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${input.actorId} AND role='membership-administrator')
      AND NOT EXISTS(SELECT 1 FROM membership_reference q JOIN membership_reference_response s ON s.request_id=q.id
        WHERE q.user_id=m.user_id AND s.actor_user_id=${input.actorId} AND s.outcome='endorse')`);
      return result.meta.changes > 0;
    },
    async correctionHistory(userId: string) {
      return db.all<{
        revision: number;
        actorUserId: string;
        oldHouse: string;
        house: string;
        reason: string;
        checkSource: string;
        checkNote: string;
        occurredAt: string;
      }>(
        sql`SELECT revision,actor_user_id AS actorUserId,old_house AS oldHouse,house,reason,check_source AS checkSource,check_note AS checkNote,occurred_at AS occurredAt FROM membership_house_correction WHERE user_id=${userId} ORDER BY revision DESC`
      );
    },
    async applicantDetails(userId: string) {
      const [applications, revisions, decisions] = await db.batch([
        db.select().from(membershipApplication).where(eq(membershipApplication.userId, userId)),
        db
          .select({
            revision: membershipRevision.revision,
            schoolName: membershipRevision.schoolName,
            studentType: membershipRevision.studentType,
            graduationYear: membershipRevision.graduationYear,
            attendanceStart: membershipRevision.attendanceStart,
            attendanceEnd: membershipRevision.attendanceEnd,
            house: membershipRevision.house,
            explanation: membershipRevision.explanation,
            submittedAt: membershipRevision.submittedAt,
          })
          .from(membershipRevision)
          .where(eq(membershipRevision.userId, userId))
          .orderBy(desc(membershipRevision.revision)),
        db
          .select({
            revision: membershipDecision.revision,
            outcome: membershipDecision.outcome,
            applicantMessage: membershipDecision.applicantMessage,
            occurredAt: membershipDecision.occurredAt,
          })
          .from(membershipDecision)
          .where(eq(membershipDecision.userId, userId))
          .orderBy(desc(membershipDecision.revision)),
      ]);
      return { application: applications[0] ?? null, revisions, decisions };
    },
    async insertRevision(input: {
      userId: string;
      revision: number;
      schoolName: string;
      studentType: "graduate" | "former-student";
      graduationYear: number | null;
      attendanceStart: number | null;
      attendanceEnd: number | null;
      house: string;
      explanation: string;
      expected: number;
    }) {
      const result = await db.run(sql`INSERT INTO membership_revision
    (user_id,revision,school_name,student_type,graduation_year,attendance_start,attendance_end,house,explanation)
    SELECT ${input.userId},${input.revision},${input.schoolName},${input.studentType},${input.graduationYear},${input.attendanceStart},${input.attendanceEnd},${input.house},${input.explanation} WHERE NOT EXISTS (SELECT 1 FROM alumni_membership WHERE user_id = ${input.userId})
    AND COALESCE((SELECT revision FROM membership_application WHERE user_id = ${input.userId}),0) = ${input.expected}
    AND NOT EXISTS (SELECT 1 FROM membership_application WHERE user_id = ${input.userId} AND status = 'approved')`);
      return result.meta.changes > 0;
    },
    async reviewQueue(input: { after: string }) {
      return db.all<
        Application & { schoolName: string; house: string }
      >(sql`SELECT a.user_id AS userId,a.revision,a.status,a.updated_at AS updatedAt,
    r.school_name AS schoolName,r.house FROM membership_application a JOIN membership_revision r
    ON a.user_id = r.user_id AND a.revision = r.revision
    WHERE a.status = 'pending' AND a.user_id > ${input.after}
    AND NOT EXISTS(SELECT 1 FROM membership_reference q WHERE q.user_id = a.user_id AND q.revision = a.revision
      AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS(SELECT 1 FROM membership_reference_response WHERE request_id = q.id)) ORDER BY a.user_id LIMIT 101`);
    },
    async decisionHistory(input: { userId: string }) {
      return db.all<Decision>(sql`SELECT id,revision,actor_user_id AS actorUserId,outcome,
    reason,applicant_message AS applicantMessage,check_source AS checkSource,check_note AS checkNote,occurred_at AS occurredAt
    FROM membership_decision WHERE user_id = ${input.userId} ORDER BY revision DESC`);
    },
    async insertDecision(input: {
      id: string;
      userId: string;
      revision: number;
      actorId: string;
      outcome: "approved" | "rejected" | "action-required";
      reason: string;
      applicantMessage: string;
      checkSource: "trusted-alumnus" | "school-staff" | null;
      checkNote: string | null;
    }) {
      const result = await db.run(sql`INSERT INTO membership_decision
    (id,user_id,revision,actor_user_id,outcome,reason,applicant_message,check_source,check_note)
    SELECT ${input.id},${input.userId},${input.revision},${input.actorId},${input.outcome},${input.reason},${input.applicantMessage},${input.checkSource},${input.checkNote} WHERE EXISTS (SELECT 1 FROM role_assignment WHERE user_id = ${input.actorId} AND role = 'membership-administrator')
    AND EXISTS (SELECT 1 FROM membership_application WHERE user_id = ${input.userId} AND revision = ${input.revision} AND status = 'pending')
    AND NOT EXISTS (SELECT 1 FROM alumni_membership WHERE user_id = ${input.userId})
    AND NOT EXISTS (SELECT 1 FROM membership_reference q JOIN membership_reference_response s ON s.request_id = q.id
      WHERE q.user_id = ${input.userId} AND s.actor_user_id = ${input.actorId} AND s.outcome = 'endorse')
    AND NOT EXISTS (SELECT 1 FROM membership_reference q WHERE q.user_id = ${input.userId} AND q.revision = ${input.revision}
      AND q.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND NOT EXISTS (SELECT 1 FROM membership_reference_response WHERE request_id = q.id))`);
      return result.meta.changes > 0;
    },
  };
}
