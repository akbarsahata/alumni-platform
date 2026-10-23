import { z } from "zod";
import {
  locationModes,
  needCategories,
  participationTerms,
  type LocationMode,
  type ParticipationTerm,
} from "./model";
import {
  normalizeInitiativeLink,
  parseTimeCommitment,
  parseTiming,
  serializeTiming,
  timeCommitmentAmountPattern,
  timeCommitmentFrequencies,
  timeCommitmentUnits,
  type TimeCommitmentFrequency,
} from "./payload";

const requiredText = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, `Maksimal ${max} karakter.`);
const optionalText = (max: number) =>
  z.string().trim().max(max, `Maksimal ${max} karakter.`).default("");

const categorySchema = z.enum(needCategories, { error: "Pilih jenis kebutuhan." });
const titleSchema = requiredText(200, "Judul wajib diisi.");
const purposeSchema = requiredText(2000, "Tujuan sekolah wajib diisi.");
const requestedHelpSchema = requiredText(2000, "Keahlian atau bantuan wajib diisi.");
const locationModeSchema = z.enum(locationModes, { error: "Pilih lokasi kegiatan." });
const participationTermsSchema = z.enum(participationTerms, {
  error: "Pilih ketentuan partisipasi.",
});
const staffContactUserIdSchema = z
  .string()
  .trim()
  .min(1, "Pilih perwakilan staf terverifikasi.")
  .max(200, "Maksimal 200 karakter.");
const locationDetailsSchema = z
  .string()
  .trim()
  .max(500, "Alamat/lokasi maksimal 500 karakter.")
  .default("");
const paidDetailsSchema = optionalText(1000);
const initiativeLinkSchema = z
  .string()
  .trim()
  .max(500, "Tautan maksimal 500 karakter.")
  .default("")
  .refine(
    (value) => normalizeInitiativeLink(value).valid,
    "Masukkan tautan yang valid, misalnya https://contoh.sch.id/kegiatan."
  );

const timeCommitmentPayloadSchema = z
  .string()
  .trim()
  .max(500, "Format komitmen waktu tidak valid.")
  .refine((value) => parseTimeCommitment(value) !== null, "Format komitmen waktu tidak valid.");
const timingPayloadSchema = z
  .string()
  .trim()
  .max(500, "Format waktu pelaksanaan tidak valid.")
  .refine((value) => parseTiming(value) !== null, "Format waktu pelaksanaan tidak valid.");

const schoolNeedFormShape = {
  category: categorySchema,
  title: titleSchema,
  purpose: purposeSchema,
  requestedHelp: requestedHelpSchema,
  timeCommitmentAmount: z
    .string()
    .trim()
    .min(1, "Jumlah komitmen wajib diisi.")
    .regex(timeCommitmentAmountPattern, "Jumlah harus bilangan bulat antara 1 dan 9999."),
  timeCommitmentUnit: z.enum(timeCommitmentUnits, { error: "Pilih satuan jam atau hari." }),
  timeCommitmentFrequency: z
    .string()
    .trim()
    .default("")
    .refine(
      (value) => !value || timeCommitmentFrequencies.includes(value as TimeCommitmentFrequency),
      "Pilih frekuensi yang tersedia."
    ),
  timingFrom: z
    .string()
    .trim()
    .min(1, "Tanggal mulai wajib diisi.")
    .refine((value) => parseTiming(value) !== null, "Tanggal mulai tidak valid."),
  timingUntil: z
    .string()
    .trim()
    .default("")
    .refine((value) => !value || parseTiming(value) !== null, "Tanggal selesai tidak valid."),
  locationMode: locationModeSchema,
  locationDetails: locationDetailsSchema,
  staffContactUserId: staffContactUserIdSchema,
  participationTerms: participationTermsSchema,
  paidDetails: paidDetailsSchema,
  initiativeLink: initiativeLinkSchema,
} as const;

export type SchoolNeedFieldName = keyof typeof schoolNeedFormShape;
export type SchoolNeedFieldErrors = Partial<Record<SchoolNeedFieldName, string>>;
export const schoolNeedFieldOrder = Object.keys(schoolNeedFormShape) as SchoolNeedFieldName[];

type ConditionalValue = {
  locationMode: string;
  locationDetails: string;
  participationTerms: string;
  paidDetails: string;
};

export function schoolNeedConditionalIssues(value: ConditionalValue) {
  const issues: { path: SchoolNeedFieldName; message: string }[] = [];
  if (
    locationModes.includes(value.locationMode as LocationMode) &&
    value.locationMode !== "remote" &&
    !value.locationDetails
  )
    issues.push({
      path: "locationDetails",
      message:
        value.locationMode === "off-site"
          ? "Alamat/lokasi di luar sekolah wajib diisi."
          : "Alamat/lokasi sekolah wajib diisi.",
    });
  if (
    participationTerms.includes(value.participationTerms as ParticipationTerm) &&
    value.participationTerms === "paid" &&
    !value.paidDetails
  )
    issues.push({
      path: "paidDetails",
      message: "Rincian kompensasi wajib diisi untuk kegiatan berbayar.",
    });
  return issues;
}

function addConditionalIssues(
  value: ConditionalValue,
  addIssue: (issue: { path: SchoolNeedFieldName; message: string }) => void
) {
  for (const issue of schoolNeedConditionalIssues(value)) addIssue(issue);
}

export const schoolNeedFormSchema = z.object(schoolNeedFormShape).superRefine((value, ctx) => {
  addConditionalIssues(value, (issue) =>
    ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message })
  );
  if (
    value.timingFrom &&
    value.timingUntil &&
    parseTiming(value.timingFrom) &&
    parseTiming(value.timingUntil) &&
    parseTiming(serializeTiming(value.timingFrom, value.timingUntil)) === null
  )
    ctx.addIssue({
      code: "custom",
      path: ["timingUntil"],
      message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    });
});

export const schoolNeedApiFields = {
  category: categorySchema,
  title: titleSchema,
  purpose: purposeSchema,
  requestedHelp: requestedHelpSchema,
  timeCommitment: timeCommitmentPayloadSchema,
  timing: timingPayloadSchema,
  locationMode: locationModeSchema,
  locationDetails: locationDetailsSchema,
  staffContactUserId: staffContactUserIdSchema,
  participationTerms: participationTermsSchema,
  paidDetails: paidDetailsSchema,
  initiativeLink: initiativeLinkSchema.transform((value) => normalizeInitiativeLink(value).value),
};
