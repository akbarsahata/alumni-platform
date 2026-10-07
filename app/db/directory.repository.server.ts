import { and, asc, eq, isNull } from "drizzle-orm";
import { database } from "./database.server";
import {
  expertiseProfile,
  alumniMembership,
  membershipApplication,
  membershipRevision,
} from "./schema";
export function directoryRepository(binding: D1Database) {
  const db = database(binding);
  return {
    async candidates() {
      return db
        .select({
          id: expertiseProfile.userId,
          participation: expertiseProfile.participation,
          displayName: expertiseProfile.displayName,
          introduction: expertiseProfile.introduction,
          city: expertiseProfile.city,
          country: expertiseProfile.country,
          locationFormat: expertiseProfile.locationFormat,
          expertiseTags: expertiseProfile.expertiseTags,
          helpTypes: expertiseProfile.helpTypes,
          availability: expertiseProfile.availability,
          availabilityNote: expertiseProfile.availabilityNote,
          confirmedAt: expertiseProfile.confirmedAt,
          schoolName: membershipRevision.schoolName,
          studentType: membershipRevision.studentType,
          graduationYear: membershipRevision.graduationYear,
          attendanceStart: membershipRevision.attendanceStart,
          attendanceEnd: membershipRevision.attendanceEnd,
        })
        .from(expertiseProfile)
        .innerJoin(
          alumniMembership,
          and(
            eq(alumniMembership.userId, expertiseProfile.userId),
            eq(alumniMembership.status, "approved")
          )
        )
        .leftJoin(
          membershipApplication,
          and(
            eq(membershipApplication.userId, expertiseProfile.userId),
            eq(membershipApplication.status, "approved")
          )
        )
        .leftJoin(
          membershipRevision,
          and(
            eq(membershipRevision.userId, membershipApplication.userId),
            eq(membershipRevision.revision, membershipApplication.revision)
          )
        )
        .where(
          and(
            eq(expertiseProfile.participation, true),
            isNull(expertiseProfile.deletionRequestedAt)
          )
        )
        .orderBy(asc(expertiseProfile.userId));
    },
  };
}
