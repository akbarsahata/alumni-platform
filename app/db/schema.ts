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

export const membershipStatusDecision = sqliteTable("membership_status_decision", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  version: integer("version").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  outcome: text("outcome", { enum: ["approved", "suspended"] }).notNull(),
  reason: text("reason").notNull(),
  applicantMessage: text("applicant_message").notNull(),
  occurredAt: text("occurred_at").notNull(),
});
export const membershipSuspensionRequest = sqliteTable("membership_suspension_request", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  suspensionId: text("suspension_id").notNull(),
  explanation: text("explanation").notNull(),
  requestedAt: text("requested_at").notNull(),
  resolvedBy: text("resolved_by"),
});

export const emailChangeRequest = sqliteTable("email_change_request", {
  id: text("id").primaryKey(),
  targetUserId: text("target_user_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  verifiedBy: text("verified_by"),
  endedBy: text("ended_by"),
  oldEmail: text("old_email").notNull(),
  newEmail: text("new_email").notNull(),
  identityCheck: text("identity_check").notNull(),
  reason: text("reason").notNull(),
  tokenHash: text("token_hash").notNull(),
  status: text("status", {
    enum: ["pending", "completed", "expired", "replaced", "collision"],
  }).notNull(),
  requestedAt: text("requested_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  completedAt: text("completed_at"),
  endedAt: text("ended_at"),
});

export const expertiseProfile = sqliteTable("expertise_profile", {
  deletionRequestedAt: text("deletion_requested_at"),
  locationFormat: integer("location_format").notNull(),
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  introduction: text("introduction").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  availabilityNote: text("availability_note").notNull(),
  expertiseTags: text("expertise_tags", { mode: "json" }).$type<string[]>().notNull(),
  helpTypes: text("help_types", { mode: "json" }).$type<string[]>().notNull(),
  availability: text("availability", { enum: ["available", "limited", "unavailable"] }),
  participation: integer("participation", { mode: "boolean" }).notNull(),
  confirmedAt: text("confirmed_at").notNull(),
});

export const expertiseTag = sqliteTable("expertise_tag", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  retired: integer("retired", { mode: "boolean" }).notNull(),
  version: integer("version").notNull(),
  replacementId: text("replacement_id"),
});
export const expertiseTagEvent = sqliteTable("expertise_tag_event", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  tagId: text("tag_id").notNull(),
  label: text("label").notNull(),
  expectedVersion: integer("expected_version").notNull(),
  replacementId: text("replacement_id"),
  occurredAt: text("occurred_at").notNull(),
});

export const schoolNeed = sqliteTable("school_need", {
  id: text("id").primaryKey(),
  submitterUserId: text("submitter_user_id").notNull(),
  version: integer("version").notNull(),
  category: text("category", { enum: ["school-activity", "student-mentoring"] }).notNull(),
  title: text("title").notNull(),
  purpose: text("purpose").notNull(),
  requestedHelp: text("requested_help").notNull(),
  timeCommitment: text("time_commitment").notNull(),
  timing: text("timing"),
  deadline: text("deadline"),
  locationMode: text("location_mode", { enum: ["remote", "on-site"] }).notNull(),
  locationDetails: text("location_details").notNull(),
  staffContactUserId: text("staff_contact_user_id").notNull(),
  staffContactName: text("staff_contact_name").notNull(),
  participationTerms: text("participation_terms", { enum: ["voluntary", "paid"] }).notNull(),
  paidDetails: text("paid_details").notNull(),
  initiativeLink: text("initiative_link"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const schoolNeedRevision = sqliteTable(
  "school_need_revision",
  {
    needId: text("need_id").notNull(),
    version: integer("version").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    category: text("category", { enum: ["school-activity", "student-mentoring"] }).notNull(),
    title: text("title").notNull(),
    purpose: text("purpose").notNull(),
    requestedHelp: text("requested_help").notNull(),
    timeCommitment: text("time_commitment").notNull(),
    timing: text("timing"),
    deadline: text("deadline"),
    locationMode: text("location_mode", { enum: ["remote", "on-site"] }).notNull(),
    locationDetails: text("location_details").notNull(),
    staffContactUserId: text("staff_contact_user_id").notNull(),
    staffContactName: text("staff_contact_name").notNull(),
    participationTerms: text("participation_terms", { enum: ["voluntary", "paid"] }).notNull(),
    paidDetails: text("paid_details").notNull(),
    initiativeLink: text("initiative_link"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.needId, table.version] })]
);

export const schoolNeedApproval = sqliteTable(
  "school_need_approval",
  {
    needId: text("need_id").notNull(),
    version: integer("version").notNull(),
    stage: text("stage", { enum: ["staff-validation", "directory-approval"] }).notNull(),
    actorUserId: text("actor_user_id").notNull(),
    approvedAt: text("approved_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.needId, table.version, table.stage] })]
);

export const schoolNeedAudit = sqliteTable("school_need_audit", {
  id: text("id").primaryKey(),
  needId: text("need_id").notNull(),
  version: integer("version").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  occurredAt: text("occurred_at").notNull(),
});
