export const needCategories = ["school-activity", "student-mentoring"] as const;
export const locationModes = ["remote", "on-site"] as const;
export const participationTerms = ["voluntary", "paid"] as const;

export type NeedCategory = (typeof needCategories)[number];
export type LocationMode = (typeof locationModes)[number];
export type ParticipationTerm = (typeof participationTerms)[number];
export type NeedStatus = "awaiting-staff" | "awaiting-coordinator" | "approved";

export const needCategoryLabels: Record<NeedCategory, string> = {
  "school-activity": "Kegiatan sekolah",
  "student-mentoring": "Pendampingan siswa",
};

export const needStatusLabels: Record<NeedStatus, string> = {
  "awaiting-staff": "Menunggu validasi perwakilan staf",
  "awaiting-coordinator": "Menunggu persetujuan koordinator direktori",
  approved: "Disetujui untuk penjangkauan",
};
