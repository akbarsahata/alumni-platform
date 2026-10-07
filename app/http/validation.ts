import { helpTypes, availabilityChoices } from "../profiles/model";
import { z } from "zod";
import { houses } from "../membership/model";
import { roles } from "../authorization/roles";
import { locationModes, needCategories, participationTerms } from "../school-needs/model";

export function parseInput<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Response(message, { status: 400 });
  return result.data;
}
const requiredText = (max: number) => z.string().max(max).trim().min(1);
const integer = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  z
    .union([z.number(), z.string().min(1)])
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
const year = integer(1900).refine((value) => value <= new Date().getUTCFullYear());
const absent = z
  .unknown()
  .optional()
  .refine((value) => !value)
  .transform(() => null);
const identity = {
  expectedRevision: integer(0, Number.MAX_SAFE_INTEGER - 1),
  schoolName: requiredText(200),
  house: z.enum(houses),
  explanation: requiredText(1000),
};
export const applicationInput = z
  .discriminatedUnion("studentType", [
    z.object({
      ...identity,
      studentType: z.literal("graduate"),
      graduationYear: year,
      attendanceStart: absent,
      attendanceEnd: absent,
    }),
    z.object({
      ...identity,
      studentType: z.literal("former-student"),
      graduationYear: absent,
      attendanceStart: year,
      attendanceEnd: year,
    }),
  ])
  .refine(
    (value) => value.studentType === "graduate" || value.attendanceEnd >= value.attendanceStart
  );
const review = {
  expectedRevision: integer(1),
  reason: requiredText(1000),
  applicantMessage: requiredText(1000),
};
export const decisionInput = z.discriminatedUnion("outcome", [
  z
    .object({ ...review, outcome: z.literal("action-required") })
    .transform((value) => ({ ...value, checkSource: null, checkNote: null })),
  z.object({
    ...review,
    outcome: z.enum(["approved", "rejected"]),
    checkSource: z.enum(["trusted-alumnus", "school-staff"]),
    checkNote: requiredText(1000),
  }),
]);
export const roleInput = z.object({
  targetUserId: z.string().min(1).max(200),
  role: z.enum(roles),
  action: z.enum(["grant", "revoke"]),
  reason: requiredText(1000),
});
export const referenceInput = z.object({
  expectedRevision: integer(1),
  email: z
    .string()
    .max(254)
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
    .toLowerCase(),
});
export const responseInput = z
  .object({
    outcome: z.enum(["endorse", "decline", "cannot-confirm"]),
    personallyKnown: z
      .unknown()
      .optional()
      .transform((value) => value === true || value === "on"),
    comment: z
      .string()
      .max(1000)
      .optional()
      .transform((value) => (value ?? "").trim()),
  })
  .refine((value) => value.outcome !== "endorse" || value.personallyKnown);
export const queueCursor = z.string().max(200);
export const auditCursor = z.string().regex(/^\d{4}-\d{2}-\d{2}T.*Z\|[a-f0-9]{32,33}$/);
export const signInCodeInput = z.object({ type: z.literal("sign-in") });

export const manualReviewInput = z.object({
  expectedRevision: integer(1),
  explanation: requiredText(1000),
});

export const houseCorrectionInput = z.object({
  ...review,
  expectedRevision: integer(0),
  house: z.enum(houses),
  checkSource: z.enum(["trusted-alumnus", "school-staff"]),
  checkNote: requiredText(1000),
});

export const invitationInput = z
  .object({
    email: referenceInput.shape.email,
    role: z.enum(["staff", "student"]),
    reason: requiredText(1000),
  })
  .strict();
export const invitationAcceptanceInput = z.object({}).strict();
const needText = (max: number) => z.string().trim().min(1).max(max);
export const schoolNeedInput = z
  .object({
    category: z.enum(needCategories),
    title: needText(200),
    purpose: needText(2000),
    requestedHelp: needText(2000),
    timeCommitment: needText(500),
    timing: z.string().trim().max(500).default(""),
    deadline: z
      .union([z.string(), z.null()])
      .nullable()
      .default(null)
      .transform((value) => (value ? value : null))
      .refine(
        (value) =>
          value === null ||
          (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
            !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) &&
            new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value)
      ),
    locationMode: z.enum(locationModes),
    locationDetails: z.string().trim().max(500).default(""),
    staffContactUserId: z.string().min(1).max(200),
    staffContactName: needText(200),
    participationTerms: z.enum(participationTerms),
    paidDetails: z.string().trim().max(1000).default(""),
    initiativeLink: z
      .string()
      .trim()
      .max(500)
      .default("")
      .refine((value) => !value || /^https?:\/\/\S+$/i.test(value)),
    expectedVersion: z
      .union([z.number(), z.string().min(1)])
      .transform(Number)
      .pipe(
        z
          .number()
          .int()
          .min(1)
          .max(Number.MAX_SAFE_INTEGER - 1)
      )
      .optional(),
  })
  .strict()
  .refine((value) => value.timing.length > 0 || value.deadline !== null, {
    path: ["timing"],
  })
  .refine((value) => value.locationMode !== "on-site" || value.locationDetails.length > 0, {
    path: ["locationDetails"],
  })
  .refine((value) => value.participationTerms !== "paid" || value.paidDetails.length > 0, {
    path: ["paidDetails"],
  });
export const schoolNeedApprovalInput = z
  .object({
    expectedVersion: z
      .union([z.number(), z.string().min(1)])
      .transform(Number)
      .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)),
  })
  .strict();
export const membershipStatusInput = z.object({
  expectedVersion: integer(0, Number.MAX_SAFE_INTEGER - 1),
  outcome: z.enum(["suspended", "approved"]),
  reason: requiredText(1000),
  applicantMessage: requiredText(1000),
});
export const suspensionRequestInput = z.object({
  suspensionId: z.string().uuid(),
  explanation: requiredText(1000),
});
export const emailChangeInput = z
  .object({
    targetUserId: z.string().min(1).max(200),
    newEmail: referenceInput.shape.email,
    identityCheck: requiredText(1000),
    reason: requiredText(1000),
  })
  .strict();
export const emailChangeVerificationInput = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const emailChangeRequestId = z.string().regex(/^[a-f0-9]{32}$/);

const profileBoolean = z.boolean().default(false);
export const profileInput = z
  .object({
    displayName: z.string().max(200).trim().default(""),
    introduction: z.string().trim().min(1).max(2000),
    city: z.array(z.string().min(1).max(500)).max(20).default([]),
    country: z.array(z.string().min(1).max(500)).max(20).default([]),
    availabilityNote: z.string().max(1000).trim().default(""),
    expertiseTags: z
      .array(z.string().min(1).max(100))
      .max(50)
      .transform((values) => [...new Set(values)]),
    helpTypes: z
      .array(z.enum(helpTypes))
      .max(helpTypes.length)
      .transform((values) => [...new Set(values)]),
    availability: z.enum(availabilityChoices).nullable().default(null),
    participation: profileBoolean,
    participationConsent: profileBoolean,
  })
  .strict()
  .refine(
    (value) =>
      !value.participation ||
      (value.participationConsent &&
        value.expertiseTags.length > 0 &&
        value.helpTypes.length > 0 &&
        value.availability !== null)
  );

const optionalYear = year.optional();
const directoryLocations = z
  .union([z.string().max(500), z.array(z.string().min(1).max(500)).max(20)])
  .transform((value) => (typeof value === "string" ? [value] : value))
  .optional();
export const directorySearchInput = z
  .object({
    expertise: z.string().min(1).max(100).optional(),
    introduction: z.string().max(200).optional(),
    city: directoryLocations,
    country: directoryLocations,
    helpType: z.enum(helpTypes).optional(),
    availability: z.enum(["available", "limited"]).optional(),
    graduationFrom: optionalYear,
    graduationTo: optionalYear,
    attendanceFrom: optionalYear,
    attendanceTo: optionalYear,
    cursor: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (v) =>
      (v.graduationFrom === undefined ||
        v.graduationTo === undefined ||
        v.graduationFrom <= v.graduationTo) &&
      (v.attendanceFrom === undefined ||
        v.attendanceTo === undefined ||
        v.attendanceFrom <= v.attendanceTo)
  );

export const taxonomyInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), label: requiredText(100) }).strict(),
  z
    .object({
      action: z.enum(["rename", "replace"]),
      id: z.string().min(1).max(100),
      expectedVersion: integer(0),
      label: requiredText(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("retire"),
      id: z.string().min(1).max(100),
      expectedVersion: integer(0),
    })
    .strict(),
]);
