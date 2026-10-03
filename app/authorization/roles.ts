export const roles = ["membership-administrator", "finance-coordinator", "directory-coordinator", "staff", "student"] as const;
export type Role = typeof roles[number];
export const roleLabels: Record<Role, string> = {
  "membership-administrator": "Administrator keanggotaan",
  "finance-coordinator": "Koordinator keuangan",
  "directory-coordinator": "Koordinator direktori",
  staff: "Perwakilan staf sekolah",
  student: "Perwakilan siswa",
};
