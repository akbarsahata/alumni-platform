import { eq, isNull, and, sql } from "drizzle-orm";
import { database } from "./database.server";
import { membershipNotification } from "./schema";

export function notificationRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async pending(input: { userId: string }) {
      return db
        .select({
          id: membershipNotification.id,
          email: membershipNotification.email,
          kind: membershipNotification.kind,
          message: membershipNotification.message,
        })
        .from(membershipNotification)
        .where(
          and(
            eq(membershipNotification.userId, input.userId),
            isNull(membershipNotification.deliveredAt)
          )
        )
        .orderBy(sql`rowid`)
        .all();
    },
    async markDelivered(input: { id: string }) {
      const result = await db
        .update(membershipNotification)
        .set({ deliveredAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ','now')` })
        .where(eq(membershipNotification.id, input.id))
        .run();
      return result.meta.changes > 0;
    },
  };
}
