import { format, formatDistance } from "date-fns";
import { id as indonesianLocale } from "date-fns/locale";
import { useEffect, useState } from "react";

function asDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function utcFallback(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function localZoneName(date: Date) {
  return (
    new Intl.DateTimeFormat("id-ID", { timeZoneName: "short" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}

function formatLocal(date: Date, now: Date) {
  const absolute = format(date, "d MMM yyyy, HH.mm", { locale: indonesianLocale });
  const zone = localZoneName(date);
  const relative = formatDistance(date, now, {
    addSuffix: true,
    locale: indonesianLocale,
  });
  return `${absolute}${zone ? ` ${zone}` : ""} (${relative})`;
}

/**
 * Renders an absolute timestamp in the browser's local timezone and timezone
 * abbreviation, followed by a Bahasa Indonesia relative description.
 *
 * The server and first client render use a UTC fallback so hydration is stable;
 * after mounting, the component switches to the browser locale timezone and
 * refreshes the relative description every minute.
 */
export function LocalTimestamp({ value, className }: { value: string; className?: string }) {
  const [now, setNow] = useState<Date | null>(null);
  const date = asDate(value);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!date) return <span className={className}>{value}</span>;
  return (
    <time className={className} dateTime={value}>
      {now ? formatLocal(date, now) : `${utcFallback(date)} UTC`}
    </time>
  );
}
