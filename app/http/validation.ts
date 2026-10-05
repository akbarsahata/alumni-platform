import { z } from "zod";
import { houses } from "../membership/model";
import { roles } from "../authorization/roles";

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
