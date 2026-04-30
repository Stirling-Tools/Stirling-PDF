export function formatUTC(iso: string, withTime: boolean): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
    timeZone: "UTC",
  }).format(date);
  return withTime ? `${formatted} UTC` : formatted;
}
