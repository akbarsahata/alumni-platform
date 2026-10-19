export type OutreachStatus = "pending" | "interested" | "declined" | "cancelled" | "expired";
export const outreachStatusLabels: Record<OutreachStatus, string> = {
  pending: "Menunggu respons",
  interested: "Berminat",
  declined: "Ditolak",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
};
export type OutreachAuditCursor = { occurredAt: string; id: string };
export function parseOutreachAuditCursor(value: string): OutreachAuditCursor {
  const [occurredAt, id] = value.split("|");
  return { occurredAt, id };
}
export function formatOutreachAuditCursor(cursor: OutreachAuditCursor) {
  return `${cursor.occurredAt}|${cursor.id}`;
}
