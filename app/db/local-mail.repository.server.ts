import { and, eq, gt } from "drizzle-orm";
import { database } from "./database.server";
import { localIntroductionMail } from "./schema";

export function localMailRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async introduction(recipient: string) {
      return (
        await db
          .select({
            message: localIntroductionMail.message,
            capturedAt: localIntroductionMail.capturedAt,
          })
          .from(localIntroductionMail)
          .where(
            and(
              eq(localIntroductionMail.recipient, recipient),
              gt(localIntroductionMail.expiresAt, Date.now())
            )
          )
      )[0];
    },
  };
}
