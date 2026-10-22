import {
  locationModes,
  needCategories,
  participationTerms,
  type LocationMode,
  type NeedCategory,
  type ParticipationTerm,
} from "./model";
import {
  normalizeInitiativeLink,
  parseTiming,
  timeCommitmentFrequencies,
  timeCommitmentUnits,
  type TimeCommitmentFrequency,
  type TimeCommitmentUnit,
} from "./payload";

export const schoolNeedFieldOrder = [
  "category",
  "title",
  "purpose",
  "requestedHelp",
  "timeCommitmentAmount",
  "timeCommitmentUnit",
  "timeCommitmentFrequency",
  "timingFrom",
  "timingUntil",
  "locationMode",
  "locationDetails",
  "staffContactUserId",
  "participationTerms",
  "paidDetails",
  "initiativeLink",
] as const;

export type SchoolNeedFieldName = (typeof schoolNeedFieldOrder)[number];
export type SchoolNeedFieldErrors = Partial<Record<SchoolNeedFieldName, string>>;

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function lengthError(
  errors: SchoolNeedFieldErrors,
  name: SchoolNeedFieldName,
  value: string,
  max: number,
  requiredMessage: string
) {
  if (!value) errors[name] = requiredMessage;
  else if (value.length > max) errors[name] = `Maksimal ${max} karakter.`;
}

export function validateSchoolNeedForm(form: FormData): SchoolNeedFieldErrors {
  const errors: SchoolNeedFieldErrors = {};

  const category = text(form, "category");
  if (!needCategories.includes(category as NeedCategory))
    errors.category = "Pilih jenis kebutuhan.";

  const title = text(form, "title");
  lengthError(errors, "title", title, 200, "Judul wajib diisi.");

  const purpose = text(form, "purpose");
  lengthError(errors, "purpose", purpose, 2000, "Tujuan sekolah wajib diisi.");

  const requestedHelp = text(form, "requestedHelp");
  lengthError(errors, "requestedHelp", requestedHelp, 2000, "Keahlian atau bantuan wajib diisi.");

  const amount = text(form, "timeCommitmentAmount");
  if (!amount) errors.timeCommitmentAmount = "Jumlah komitmen wajib diisi.";
  else if (!/^[1-9]\d{0,3}$/.test(amount))
    errors.timeCommitmentAmount = "Jumlah harus bilangan bulat antara 1 dan 9999.";

  const unit = text(form, "timeCommitmentUnit");
  if (!timeCommitmentUnits.includes(unit as TimeCommitmentUnit))
    errors.timeCommitmentUnit = "Pilih satuan jam atau hari.";

  const frequency = text(form, "timeCommitmentFrequency");
  if (frequency && !timeCommitmentFrequencies.includes(frequency as TimeCommitmentFrequency))
    errors.timeCommitmentFrequency = "Pilih frekuensi yang tersedia.";

  const timingFrom = text(form, "timingFrom");
  const timingUntil = text(form, "timingUntil");
  const validFrom = parseTiming(timingFrom) !== null;
  if (!timingFrom) errors.timingFrom = "Tanggal mulai wajib diisi.";
  else if (!validFrom) errors.timingFrom = "Tanggal mulai tidak valid.";
  if (timingUntil) {
    if (!parseTiming(timingUntil)) errors.timingUntil = "Tanggal selesai tidak valid.";
    else if (validFrom && timingUntil < timingFrom)
      errors.timingUntil = "Tanggal selesai tidak boleh sebelum tanggal mulai.";
  }

  const locationMode = text(form, "locationMode");
  const validLocationMode = locationModes.includes(locationMode as LocationMode);
  if (!validLocationMode) errors.locationMode = "Pilih lokasi kegiatan.";

  const locationDetails = text(form, "locationDetails");
  if (validLocationMode && locationMode !== "remote" && !locationDetails)
    errors.locationDetails =
      locationMode === "off-site"
        ? "Alamat/lokasi di luar sekolah wajib diisi."
        : "Alamat/lokasi sekolah wajib diisi.";
  else if (locationDetails.length > 500)
    errors.locationDetails = "Alamat/lokasi maksimal 500 karakter.";

  const staffContactUserId = text(form, "staffContactUserId");
  if (!staffContactUserId) errors.staffContactUserId = "Pilih perwakilan staf terverifikasi.";

  const terms = text(form, "participationTerms");
  if (!participationTerms.includes(terms as ParticipationTerm))
    errors.participationTerms = "Pilih ketentuan partisipasi.";

  const paidDetails = text(form, "paidDetails");
  if (terms === "paid" && !paidDetails)
    errors.paidDetails = "Rincian kompensasi wajib diisi untuk kegiatan berbayar.";
  else if (paidDetails.length > 1000) errors.paidDetails = "Maksimal 1000 karakter.";

  const initiativeLink = text(form, "initiativeLink");
  if (initiativeLink.length > 500) errors.initiativeLink = "Tautan maksimal 500 karakter.";
  else if (!normalizeInitiativeLink(initiativeLink).valid)
    errors.initiativeLink = "Masukkan tautan yang valid, misalnya https://contoh.sch.id/kegiatan.";

  return errors;
}
