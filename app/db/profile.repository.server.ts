import { and, eq, exists, sql } from "drizzle-orm";
import { database } from "./database.server";
import {
  alumniMembership,
  expertiseProfile,
  membershipApplication,
  membershipRevision,
} from "./schema";
export function profileRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async own(userId: string) {
      const [profiles, identities] = await db.batch([
        db
          .select({
            deletionRequestedAt: expertiseProfile.deletionRequestedAt,
            displayName: expertiseProfile.displayName,
            introduction: expertiseProfile.introduction,
            locationFormat: expertiseProfile.locationFormat,
            city: expertiseProfile.city,
            country: expertiseProfile.country,
            availabilityNote: expertiseProfile.availabilityNote,
            expertiseTags: expertiseProfile.expertiseTags,
            helpTypes: expertiseProfile.helpTypes,
            availability: expertiseProfile.availability,
            participation: expertiseProfile.participation,
            confirmedAt: expertiseProfile.confirmedAt,
          })
          .from(expertiseProfile)
          .where(eq(expertiseProfile.userId, userId)),
        db
          .select({
            schoolName: membershipRevision.schoolName,
            studentType: membershipRevision.studentType,
            graduationYear: membershipRevision.graduationYear,
            attendanceStart: membershipRevision.attendanceStart,
            attendanceEnd: membershipRevision.attendanceEnd,
          })
          .from(membershipRevision)
          .innerJoin(
            membershipApplication,
            and(
              eq(membershipApplication.userId, membershipRevision.userId),
              eq(membershipApplication.revision, membershipRevision.revision)
            )
          )
          .where(
            and(eq(membershipRevision.userId, userId), eq(membershipApplication.status, "approved"))
          ),
      ]);
      return { profile: profiles[0], identity: identities[0] ?? null };
    },
    async save(userId: string, profile: Omit<typeof expertiseProfile.$inferInsert, "userId">) {
      // One conditional statement prevents a concurrent suspension from writing.
      return await db.all<{ userId: string }>(sql`
        INSERT INTO expertise_profile (user_id, display_name, introduction, city, country, availability_note, expertise_tags, help_types, availability, participation, confirmed_at, location_format)
        SELECT ${userId}, ${profile.displayName}, ${profile.introduction}, ${profile.city}, ${profile.country}, ${profile.availabilityNote}, ${JSON.stringify(profile.expertiseTags)}, ${JSON.stringify(profile.helpTypes)}, ${profile.availability}, ${profile.participation ? 1 : 0}, ${profile.confirmedAt}, ${profile.locationFormat}
        WHERE EXISTS (SELECT 1 FROM alumni_membership WHERE user_id = ${userId} AND status = 'approved')
        AND NOT EXISTS (SELECT 1 FROM json_each(${JSON.stringify(profile.expertiseTags)}) selected
          WHERE NOT EXISTS (SELECT 1 FROM expertise_tag tag WHERE tag.id = selected.value
            AND (tag.retired = 0 OR EXISTS (SELECT 1 FROM expertise_profile previous, json_each(previous.expertise_tags) old
              WHERE previous.user_id = ${userId} AND old.value = selected.value))))
        ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, introduction = excluded.introduction, city = excluded.city, country = excluded.country, availability_note = excluded.availability_note, expertise_tags = excluded.expertise_tags, help_types = excluded.help_types, availability = excluded.availability, participation = excluded.participation, confirmed_at = excluded.confirmed_at, location_format = excluded.location_format
        RETURNING user_id AS userId
      `);
    },
    async confirm(userId: string, confirmedAt: string) {
      return await db
        .update(expertiseProfile)
        .set({ confirmedAt })
        .where(
          and(
            eq(expertiseProfile.userId, userId),
            exists(
              db
                .select({ userId: alumniMembership.userId })
                .from(alumniMembership)
                .where(
                  and(eq(alumniMembership.userId, userId), eq(alumniMembership.status, "approved"))
                )
            )
          )
        )
        .returning({ userId: expertiseProfile.userId });
    },
  };
}
