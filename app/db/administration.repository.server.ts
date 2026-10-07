import { eq, asc, sql } from "drizzle-orm";
import { database } from "./database.server";
import { user, roleAssignment } from "./schema";
import type { Role } from "../authorization/roles";

export function administrationRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async accounts() {
      const [accounts, assignments] = await db.batch([
        db
          .select({ id: user.id, email: user.email })
          .from(user)
          .where(eq(user.emailVerified, true))
          .orderBy(asc(user.email)),
        db.select().from(roleAssignment).orderBy(asc(roleAssignment.role)),
      ]);
      return accounts.map((account) => ({
        ...account,
        roles: assignments.filter((row) => row.userId === account.id).map((row) => row.role),
      }));
    },
    async audit(input: { time: string | null; id: string | null }) {
      return db.all<{
        id: string;
        actorUserId: string;
        targetUserId: string;
        action: string;
        role: string | null;
        house: string | null;
        operator: string | null;
        reason: string;
        occurredAt: string;
      }>(sql`SELECT id, actor_user_id AS actorUserId, target_user_id AS targetUserId,
    action, role, house, operator, reason, occurred_at AS occurredAt FROM (
      SELECT * FROM (
        SELECT * FROM authorization_audit
        UNION ALL SELECT id, actor_user_id, tag_id, 'expertise-' || action, NULL, NULL, NULL, '', occurred_at FROM expertise_tag_event
      )
      UNION ALL SELECT id || '0', issuer_id, email, 'invitation-issued', role, NULL, NULL, reason, issued_at FROM school_invitation
      UNION ALL SELECT id || '1', accepted_by, accepted_by, 'invitation-accepted', role, NULL, NULL, reason, accepted_at FROM school_invitation WHERE accepted_at IS NOT NULL
      UNION ALL SELECT id || '0', actor_user_id, target_user_id, 'email-change-requested', NULL, NULL, identity_check, reason, requested_at FROM email_change_request
      UNION ALL SELECT id || '1', COALESCE(verified_by,ended_by,actor_user_id), target_user_id,
        CASE WHEN status='completed' THEN 'email-change-completed'
          WHEN status='expired' OR expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'email-change-expired'
          WHEN status='replaced' THEN 'email-change-replaced' ELSE 'email-change-collision' END,
        NULL, NULL,
        CASE WHEN status='completed' THEN old_email || ' → ' || new_email ELSE identity_check END,
        reason, COALESCE(completed_at,ended_at,expires_at)
        FROM email_change_request
        WHERE status != 'pending' OR expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
    )
    WHERE ${input.time} IS NULL OR occurred_at < ${input.time} OR (occurred_at = ${input.time} AND id < ${input.id})
    ORDER BY occurred_at DESC, id DESC LIMIT 101`);
    },
    async verifiedAccount(input: { userId: string }) {
      return (
        (await db.get<{ id: string } | undefined>(
          sql`SELECT id FROM user WHERE id = ${input.userId} AND email_verified = 1`
        )) ?? null
      );
    },
    async changeRole(input: {
      id: string;
      actorId: string;
      targetId: string;
      action: "grant" | "revoke";
      role: Role;
      reason: string;
    }) {
      const result =
        await db.run(sql`INSERT INTO authorization_audit (id,actor_user_id,target_user_id,action,role,reason)
    SELECT ${input.id},${input.actorId},${input.targetId},${input.action},${input.role},${input.reason} WHERE EXISTS (SELECT 1 FROM organization_bootstrap WHERE primary_user_id = ${input.actorId})
    AND EXISTS (SELECT 1 FROM user WHERE id = ${input.targetId} AND email_verified = 1)
    AND (${input.action} = 'grant' AND NOT EXISTS (SELECT 1 FROM role_assignment WHERE user_id = ${input.targetId} AND role = ${input.role})
      OR ${input.action} = 'revoke' AND EXISTS (SELECT 1 FROM role_assignment WHERE user_id = ${input.targetId} AND role = ${input.role}))`);
      return result.meta.changes > 0;
    },
  };
}
