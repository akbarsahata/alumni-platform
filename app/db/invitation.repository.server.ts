import { and, eq, sql, isNull, gt, exists } from "drizzle-orm";
import { database } from "./database.server";
import { schoolInvitation, organizationBootstrap, user } from "./schema";

export function invitationRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async issue(input: {
      id: string;
      email: string;
      role: "staff" | "student";
      issuerId: string;
      reason: string;
    }) {
      return (
        await db
          .insert(schoolInvitation)
          .values({
            ...input,
            issuedAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
            expiresAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now','+7 days')`,
          })
          .returning()
      )[0];
    },
    async read(id: string) {
      return (await db.select().from(schoolInvitation).where(eq(schoolInvitation.id, id)))[0];
    },
    async accept(id: string, accountId: string) {
      const result = await db
        .update(schoolInvitation)
        .set({ acceptedBy: accountId, acceptedAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')` })
        .where(
          and(
            eq(schoolInvitation.id, id),
            isNull(schoolInvitation.acceptedBy),
            gt(schoolInvitation.expiresAt, sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')`),
            exists(
              db
                .select({ id: user.id })
                .from(user)
                .where(
                  and(
                    eq(user.id, accountId),
                    eq(user.emailVerified, true),
                    eq(sql`lower(${user.email})`, schoolInvitation.email)
                  )
                )
            ),
            exists(
              db
                .select()
                .from(organizationBootstrap)
                .where(eq(organizationBootstrap.primaryUserId, schoolInvitation.issuerId))
            )
          )
        )
        .returning({ id: schoolInvitation.id });
      return result.length === 1;
    },
  };
}
