import { TFunction } from "i18next";

export function formatRelativeTime(timestamp: number, t: TFunction): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("time.relative.justNow");
  if (mins < 60) return t("time.relative.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("time.relative.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("time.relative.daysAgo", { count: days });
}
