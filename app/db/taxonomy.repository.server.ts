import { asc, desc, sql } from "drizzle-orm";
import { database } from "./database.server";
import { expertiseTag, expertiseTagEvent } from "./schema";
export function taxonomyRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async tags() {
      return db.select().from(expertiseTag).orderBy(asc(expertiseTag.label));
    },
    async audit() {
      return db
        .select({
          id: expertiseTagEvent.id,
          actorUserId: expertiseTagEvent.actorUserId,
          action: expertiseTagEvent.action,
          tagId: expertiseTagEvent.tagId,
          occurredAt: expertiseTagEvent.occurredAt,
        })
        .from(expertiseTagEvent)
        .orderBy(desc(expertiseTagEvent.occurredAt), desc(expertiseTagEvent.id))
        .limit(100);
    },
    async change(input: typeof expertiseTagEvent.$inferInsert) {
      // Event and trigger effects commit atomically; recheck assignment and version.
      return db.all<{
        id: string;
      }>(sql`INSERT INTO expertise_tag_event(id,actor_user_id,action,tag_id,label,expected_version,replacement_id,occurred_at)
 SELECT ${input.id},${input.actorUserId},${input.action},${input.tagId},${input.label},${input.expectedVersion},${input.replacementId ?? null},${input.occurredAt}
 WHERE EXISTS(SELECT 1 FROM role_assignment WHERE user_id=${input.actorUserId} AND role='directory-coordinator')
 AND (${input.action}='add' OR EXISTS(SELECT 1 FROM expertise_tag WHERE id=${input.tagId} AND version=${input.expectedVersion} AND retired=0))
 AND (${input.action}='retire' OR NOT EXISTS(SELECT 1 FROM expertise_tag WHERE label=${input.label} COLLATE NOCASE AND (id!=${input.tagId} OR ${input.action}!='rename')))
 RETURNING id`);
    },
  };
}
