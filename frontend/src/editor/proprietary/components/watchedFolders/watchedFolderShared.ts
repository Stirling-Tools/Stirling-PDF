// Leaf module for the watched-folders trio (registration, workbench view, home
// page): the shared view IDs plus small pure formatters. Kept dependency-free so
// those three components don't have to import one another and form a cycle.
import type { TFunction } from "i18next";

export const WATCHED_FOLDER_VIEW_ID = "watchedFolder";
export const WATCHED_FOLDER_WORKBENCH_ID = "custom:watchedFolder" as const;

export function timeAgo(date: Date, t: TFunction): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return t("watchedFolders.time.justNow", "just now");
  const mins = Math.floor(secs / 60);
  if (mins < 60)
    return t("watchedFolders.time.minutesAgo", {
      count: mins,
      defaultValue: `${mins}m ago`,
    });
  const hours = Math.floor(mins / 60);
  if (hours < 24)
    return t("watchedFolders.time.hoursAgo", {
      count: hours,
      defaultValue: `${hours}h ago`,
    });
  const days = Math.floor(hours / 24);
  return t("watchedFolders.time.daysAgo", {
    count: days,
    defaultValue: `${days}d ago`,
  });
}

export function humaniseOp(op: string): string {
  return op
    .replace(/-pdf$|-pages$|-documents?$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\bocr\b/gi, "OCR")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
