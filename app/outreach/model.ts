export type OutreachStatus = "pending" | "interested" | "declined" | "cancelled" | "expired";
export type OutcomeState = "introduced" | "help-confirmed" | "completed" | "did-not-proceed";
export const outcomeStates = [
  "introduced",
  "help-confirmed",
  "completed",
  "did-not-proceed",
] as const satisfies readonly OutcomeState[];
export const outcomeStateLabels: Record<OutcomeState, string> = {
  introduced: "Sudah diperkenalkan",
  "help-confirmed": "Bantuan dikonfirmasi",
  completed: "Selesai",
  "did-not-proceed": "Tidak berlanjut",
};
export type OutcomeEventKind = "record" | "confirm" | "correct";
export const outcomeEventKindLabels: Record<OutcomeEventKind, string> = {
  record: "Dicatat koordinator",
  confirm: "Dikonfirmasi alumni",
  correct: "Dikoreksi alumni",
};
export type OutcomeActorKind = "member" | "coordinator";
export const outcomeActorKindLabels: Record<OutcomeActorKind, string> = {
  member: "Alumni",
  coordinator: "Koordinator direktori",
};
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
