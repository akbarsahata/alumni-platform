export type OutreachStatus = "pending" | "interested" | "declined" | "cancelled" | "expired";
export const outreachStatusLabels: Record<OutreachStatus, string> = {
  pending: "Menunggu respons",
  interested: "Berminat",
  declined: "Ditolak",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
};
export type IntroductionDeliveryState = "pending" | "claimed" | "captured" | "cancelled";
export const invalidationReasonLabels: Record<string, string> = {
  "eligibility-changed": "Kelayakan profil atau keanggotaan berubah",
  "email-changed": "Alamat email akun berubah",
  "staff-recipient-changed": "Kontak staf penerima berubah",
  "delivery-blocked": "Pengiriman tidak dapat dilanjutkan",
};
export type OutreachAuditCursor = { occurredAt: string; id: string };
export function parseOutreachAuditCursor(value: string): OutreachAuditCursor {
  const [occurredAt, id] = value.split("|");
  return { occurredAt, id };
}
export function formatOutreachAuditCursor(cursor: OutreachAuditCursor) {
  return `${cursor.occurredAt}|${cursor.id}`;
}
