export const needCategories = ["school-activity", "student-mentoring"] as const;
export const locationModes = ["remote", "on-site"] as const;
export const participationTerms = ["voluntary", "paid"] as const;
export const approvalStages = ["staff-validation", "directory-approval"] as const;

export type NeedCategory = (typeof needCategories)[number];
export type LocationMode = (typeof locationModes)[number];
export type ParticipationTerm = (typeof participationTerms)[number];

export const needCategoryLabels: Record<NeedCategory, string> = {
  "school-activity": "Kegiatan sekolah",
  "student-mentoring": "Pendampingan siswa",
};
