import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import { roles } from "../authorization/roles";
import { houses } from "../membership/model";
export { user } from "../auth/schema";

// Existing SQL migrations own constraints and triggers. These map the read/write columns.
export const roleAssignment = sqliteTable(
  "role_assignment",
  {
    userId: text("user_id").notNull(),
    role: text("role", { enum: roles }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })]
);
export const alumniMembership = sqliteTable("alumni_membership", {
  userId: text("user_id").primaryKey(),
  status: text("status", { enum: ["approved", "suspended"] }).notNull(),
  house: text("house", { enum: houses }).notNull(),
});
export const organizationBootstrap = sqliteTable("organization_bootstrap", {
  singleton: integer("singleton").primaryKey(),
  primaryUserId: text("primary_user_id").notNull(),
});
export const membershipApplication = sqliteTable("membership_application", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull(),
  status: text("status", {
    enum: ["pending", "action-required", "rejected", "approved"],
  }).notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const membershipRevision = sqliteTable(
  "membership_revision",
  {
    userId: text("user_id").notNull(),
    revision: integer("revision").notNull(),
    schoolName: text("school_name").notNull(),
    studentType: text("student_type", { enum: ["graduate", "former-student"] }).notNull(),
    graduationYear: integer("graduation_year"),
    attendanceStart: integer("attendance_start"),
    attendanceEnd: integer("attendance_end"),
    house: text("house", { enum: houses }).notNull(),
    explanation: text("explanation").notNull(),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.revision] })]
);
export const membershipDecision = sqliteTable("membership_decision", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  revision: integer("revision").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  outcome: text("outcome", { enum: ["approved", "rejected", "action-required"] }).notNull(),
  reason: text("reason").notNull(),
  applicantMessage: text("applicant_message").notNull(),
  checkSource: text("check_source", { enum: ["trusted-alumnus", "school-staff"] }),
  checkNote: text("check_note"),
  occurredAt: text("occurred_at").notNull(),
});
export const membershipReference = sqliteTable("membership_reference", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  revision: integer("revision").notNull(),
  email: text("to_email").notNull(),
  requestedAt: text("requested_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  deliveredAt: text("delivered_at"),
});
export const membershipNotification = sqliteTable("membership_notification", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("to_email").notNull(),
  kind: text("kind", { enum: ["submitted", "approved", "rejected", "action-required"] }).notNull(),
  message: text("message").notNull(),
  deliveredAt: text("delivered_at"),
});

export const membershipHouseCorrection = sqliteTable("membership_house_correction", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  revision: integer("revision").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  oldHouse: text("old_house", { enum: houses }).notNull(),
  house: text("house", { enum: houses }).notNull(),
  reason: text("reason").notNull(),
  applicantMessage: text("applicant_message").notNull(),
  checkSource: text("check_source", { enum: ["trusted-alumnus", "school-staff"] }).notNull(),
  checkNote: text("check_note").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const schoolInvitation = sqliteTable("school_invitation", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role", { enum: ["staff", "student"] }).notNull(),
  issuerId: text("issuer_id").notNull(),
  reason: text("reason").notNull(),
  issuedAt: text("issued_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  acceptedBy: text("accepted_by"),
  acceptedAt: text("accepted_at"),
});
