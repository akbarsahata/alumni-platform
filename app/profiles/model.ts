export const expertiseTags = [
  "education",
  "technology",
  "science",
  "arts",
  "business",
  "health",
  "communication",
] as const;
export const expertiseLabels: Record<(typeof expertiseTags)[number], string> = {
  education: "Pendidikan",
  technology: "Teknologi",
  science: "Sains",
  arts: "Seni",
  business: "Bisnis",
  health: "Kesehatan",
  communication: "Komunikasi",
};
export const helpTypes = ["mentoring", "speaking", "training", "project-support"] as const;
export const helpLabels: Record<(typeof helpTypes)[number], string> = {
  mentoring: "Pendampingan",
  speaking: "Narasumber",
  training: "Pelatihan",
  "project-support": "Dukungan proyek",
};
export const availabilityChoices = ["available", "limited", "unavailable"] as const;
export const availabilityLabels = {
  available: "Tersedia",
  limited: "Ketersediaan terbatas",
  unavailable: "Sementara tidak tersedia",
};
export const emptyProfile = {
  displayName: "",
  introduction: "",
  city: "",
  country: "",
  availabilityNote: "",
  expertiseTags: [] as string[],
  helpTypes: [] as string[],
  availability: null as (typeof availabilityChoices)[number] | null,
  participation: false,
  confirmedAt: null as string | null,
};
