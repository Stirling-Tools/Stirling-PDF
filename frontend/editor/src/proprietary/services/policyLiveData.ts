/**
 * Derives a policy's live activity feed + stats from the app's real uploaded
 * files (the "all uploaded files" trigger), as the counterpart to the curated
 * mock data in the catalog. Selected via the policy data-mode toggle.
 *
 * Every active policy enforces on all uploaded files, so the live feed is the
 * user's actual files (leaf versions) — meaningful immediately, unlike a folder
 * that starts empty.
 */

import { fileStorage } from "@app/services/fileStorage";
import type { PolicyActivityItem, PolicyStats } from "@app/types/policies";

export interface PolicyLiveData {
  activity: PolicyActivityItem[];
  stats: PolicyStats;
}

/** Relative "Nm/Nh ago" for an activity timestamp. */
function relativeTime(date: Date | string | number | undefined): string {
  if (!date) return "—";
  const ms = Date.now() - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

/** Duration since a timestamp, e.g. "18d" / "5h" (no "ago"). */
function durationSince(ts: number | undefined): string {
  if (!ts) return "—";
  const ms = Date.now() - ts;
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d`;
  const hrs = Math.floor(ms / 3600000);
  return hrs >= 1 ? `${hrs}h` : "Today";
}

/** Human byte size, e.g. "2.1 MB". */
function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${i > 0 && v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

const EMPTY: PolicyLiveData = {
  activity: [],
  stats: { enforced: 0, dataProcessed: "0 B", activeFor: "—" },
};

/**
 * Build the live view from the app's uploaded files. Returns empty stats/
 * activity when nothing has been uploaded yet (an honest empty state).
 */
export async function getPolicyLiveData(): Promise<PolicyLiveData> {
  const files = await fileStorage.getLeafStirlingFileStubs();
  if (files.length === 0) return EMPTY;

  const sorted = [...files].sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );
  const activity: PolicyActivityItem[] = sorted.slice(0, 8).map((f) => ({
    doc: f.name,
    action: `${formatBytes(f.size)} • enforced on upload`,
    time: relativeTime(f.createdAt),
    status: "enforced",
  }));

  const totalBytes = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
  const oldest = files.reduce(
    (min, f) => Math.min(min, f.createdAt ?? Date.now()),
    Date.now(),
  );
  return {
    activity,
    stats: {
      enforced: files.length,
      dataProcessed: formatBytes(totalBytes),
      activeFor: durationSince(oldest),
    },
  };
}
