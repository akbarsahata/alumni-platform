export const houses = [
  "Komodo",
  "Lion",
  "Rhino",
  "Hornbill",
  "Dove",
  "Eagle",
  "Dolphin",
  "Shark",
  "Mantaray",
] as const;
export const statusLabels = {
  pending: "Menunggu tinjauan manual",
  "action-required": "Perlu perbaikan",
  rejected: "Ditolak — dapat diperbaiki dan diajukan kembali",
  approved: "Keanggotaan disetujui",
};
export type Application = {
  userId: string;
  revision: number;
  status: keyof typeof statusLabels;
  updatedAt: string;
};
export type Revision = {
  revision: number;
  schoolName: string;
  studentType: "graduate" | "former-student";
  graduationYear: number | null;
  attendanceStart: number | null;
  attendanceEnd: number | null;
  house: string;
  explanation: string;
  submittedAt: string;
};
export type Decision = {
  id: string;
  revision: number;
  actorUserId: string;
  outcome: "approved" | "rejected" | "action-required";
  reason: string;
  applicantMessage: string;
  checkSource: "trusted-alumnus" | "school-staff" | null;
  checkNote: string | null;
  occurredAt: string;
};
