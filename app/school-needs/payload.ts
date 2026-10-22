export const timeCommitmentUnits = ["jam", "hari"] as const;
export const timeCommitmentFrequencies = ["per-hari", "per-minggu", "per-bulan"] as const;

export type TimeCommitmentUnit = (typeof timeCommitmentUnits)[number];
export type TimeCommitmentFrequency = (typeof timeCommitmentFrequencies)[number];

export const timeCommitmentUnitLabels: Record<TimeCommitmentUnit, string> = {
  jam: "Jam",
  hari: "Hari",
};

export const timeCommitmentFrequencyLabels: Record<TimeCommitmentFrequency, string> = {
  "per-hari": "Per hari",
  "per-minggu": "Per minggu",
  "per-bulan": "Per bulan",
};

export type TimeCommitment = {
  amount: number;
  unit: TimeCommitmentUnit;
  frequency: TimeCommitmentFrequency | null;
};

export type TimingRange = {
  from: string;
  until: string | null;
};

const timeCommitmentPattern = /^([1-9]\d{0,3})\|(jam|hari)(?:\|(per-hari|per-minggu|per-bulan))?$/;
const timingPattern = /^(\d{4}-\d{2}-\d{2})(?:\|(\d{4}-\d{2}-\d{2}))?$/;
const monthNames = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)))
    return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day} ${monthNames[month! - 1]} ${year}`;
}

/**
 * Time commitment payload: `<amount>|<unit>` or `<amount>|<unit>|<frequency>`.
 * Example: `2|jam|per-minggu`. The frequency segment is optional.
 */
export function parseTimeCommitment(value: string | null | undefined): TimeCommitment | null {
  if (!value) return null;
  const match = timeCommitmentPattern.exec(value.trim());
  if (!match) return null;
  return {
    amount: Number(match[1]),
    unit: match[2] as TimeCommitmentUnit,
    frequency: (match[3] as TimeCommitmentFrequency | undefined) ?? null,
  };
}

export function serializeTimeCommitment(amount: string, unit: string, frequency: string): string {
  const parts = [amount.trim(), unit.trim(), frequency.trim()].filter(Boolean);
  return parts.join("|");
}

export function formatTimeCommitment(value: string | null | undefined): string {
  const parsed = parseTimeCommitment(value);
  if (!parsed) return value?.trim() ?? "";
  return [
    `${parsed.amount} ${parsed.unit}`,
    parsed.frequency ? timeCommitmentFrequencyLabels[parsed.frequency].toLowerCase() : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Timing payload: `<from>` or `<from>|<until>`, both `YYYY-MM-DD`.
 * Example: `2026-11-01|2026-11-30`. The `until` segment is optional.
 */
export function parseTiming(value: string | null | undefined): TimingRange | null {
  if (!value) return null;
  const match = timingPattern.exec(value.trim());
  if (!match || !isCalendarDate(match[1]!)) return null;
  const until = match[2] ?? null;
  if (until && (!isCalendarDate(until) || until < match[1]!)) return null;
  return { from: match[1]!, until };
}

export function serializeTiming(from: string, until: string): string {
  const start = from.trim();
  const end = until.trim();
  if (!start) return "";
  return end ? `${start}|${end}` : start;
}

export function formatTimingRange(
  value: string | null | undefined,
  deadline?: string | null
): string {
  const parsed = parseTiming(value);
  if (parsed) {
    if (!parsed.until || parsed.until === parsed.from) return formatDate(parsed.from);
    return `${formatDate(parsed.from)} – ${formatDate(parsed.until)}`;
  }
  const legacy = value?.trim() ?? "";
  const legacyDeadline = deadline ? formatDate(deadline) : "";
  return [legacy, legacyDeadline].filter(Boolean).join(" · ");
}

/**
 * Adds `https://` to scheme-less links and validates the result as an HTTP(S) URL.
 */
export function normalizeInitiativeLink(raw: string): { value: string; valid: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: "", valid: true };
  if (/\s/.test(trimmed)) return { value: trimmed, valid: false };

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^[^:/]+:\d+(?:\/|$)/i.test(trimmed))
      return { value: trimmed, valid: false };
    candidate = `https://${trimmed}`;
  }

  try {
    const url = new URL(candidate);
    if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:"))
      return { value: trimmed, valid: false };
    return { value: url.toString(), valid: true };
  } catch {
    return { value: trimmed, valid: false };
  }
}
