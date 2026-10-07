import { and, asc, eq, sql } from "drizzle-orm";
import { database } from "./database.server";
import { emailChangeRequest, user } from "./schema";

export function emailChangeRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async accounts() {
      return db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.emailVerified, true))
        .orderBy(asc(user.email))
        .all();
    },
    async verifiedAccount(userId: string) {
      return (
        (await db
          .select({ id: user.id, email: user.email })
          .from(user)
          .where(and(eq(user.id, userId), eq(user.emailVerified, true)))
          .get()) ?? null
      );
    },
    async addressInUse(email: string, exceptUserId: string) {
      return !!(await db.get<{ id: string } | undefined>(
        sql`SELECT id FROM user WHERE lower(email)=${email} AND id != ${exceptUserId}`
      ));
    },
    async issue(input: {
      id: string;
      targetUserId: string;
      actorUserId: string;
      oldEmail: string;
      newEmail: string;
      identityCheck: string;
      reason: string;
      tokenHash: string;
    }) {
      const [, requests] = await db.batch([
        db
          .update(emailChangeRequest)
          .set({
            status: sql`CASE WHEN ${emailChangeRequest.expiresAt} <= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 'expired' ELSE 'replaced' END`,
            tokenHash: "",
            endedBy: sql`CASE WHEN ${emailChangeRequest.expiresAt} <= strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN NULL ELSE ${input.actorUserId} END`,
            endedAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
          })
          .where(
            and(
              eq(emailChangeRequest.targetUserId, input.targetUserId),
              eq(emailChangeRequest.status, "pending")
            )
          ),
        db
          .insert(emailChangeRequest)
          .values({
            ...input,
            status: "pending",
            requestedAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
            expiresAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now','+10 minutes')`,
          })
          .returning({ id: emailChangeRequest.id, expiresAt: emailChangeRequest.expiresAt }),
      ]);
      return requests[0];
    },
    async request(id: string) {
      return (
        (await db.select().from(emailChangeRequest).where(eq(emailChangeRequest.id, id)).get()) ??
        null
      );
    },
    async expire(input: { id: string; targetUserId: string }) {
      const result = await db.run(sql`UPDATE email_change_request
        SET status='expired', token_hash='', ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=${input.id} AND target_user_id=${input.targetUserId} AND status='pending'
        AND expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
      return result.meta.changes > 0;
    },
    async collide(input: { id: string; targetUserId: string; tokenHash: string }) {
      const result = await db.run(sql`UPDATE email_change_request
        SET status='collision', token_hash='', ended_by=${input.targetUserId},
        ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=${input.id} AND target_user_id=${input.targetUserId} AND status='pending'
        AND token_hash=${input.tokenHash}
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND EXISTS (SELECT 1 FROM user u JOIN role_assignment r ON r.user_id=u.id
          WHERE u.id=email_change_request.actor_user_id AND u.email_verified=1
          AND r.role='membership-administrator')
        AND EXISTS (SELECT 1 FROM user WHERE id != ${input.targetUserId}
          AND lower(email)=email_change_request.new_email)`);
      return result.meta.changes > 0;
    },
    async complete(input: { id: string; targetUserId: string; tokenHash: string }) {
      const result = await db.run(sql`UPDATE email_change_request
        SET status='completed', verified_by=${input.targetUserId}, token_hash='',
        completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=${input.id} AND target_user_id=${input.targetUserId} AND status='pending'
        AND token_hash=${input.tokenHash}
        AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
        AND EXISTS (SELECT 1 FROM user WHERE id=${input.targetUserId}
          AND email_verified=1 AND lower(email)=email_change_request.old_email)
        AND EXISTS (SELECT 1 FROM user u JOIN role_assignment r ON r.user_id=u.id
          WHERE u.id=email_change_request.actor_user_id AND u.email_verified=1
          AND r.role='membership-administrator')
        AND NOT EXISTS (SELECT 1 FROM user WHERE id != ${input.targetUserId}
          AND lower(email)=email_change_request.new_email)`);
      return result.meta.changes > 0;
    },
  };
}
