/**
 * Derives a policy's live activity feed + stats from its backing folder's real
 * run state (the Watch Folders processing records), as the counterpart to the
 * curated mock data in the catalog. Selected via the policy data-mode toggle.
 */

import { watchFolderFileStorage } from "@app/services/watchFolderFileStorage";
import { smartFolderStorage } from "@app/services/smartFolderStorage";
import type { PolicyActivityItem, PolicyStats } from "@app/types/policies";
import type { FolderFileMetadata } from "@app/types/smartFolders";

export interface PolicyLiveData {
  activity: PolicyActivityItem[];
  stats: PolicyStats;
}

/** Relative "Nm/Nh ago" for an activity timestamp. */
function relativeTime(date: Date | string | undefined): string {
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

/** Duration since a creation timestamp, e.g. "18d" / "5h" (no "ago"). */
function durationSince(iso: string | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d`;
  const hrs = Math.floor(ms / 3600000);
  return `${hrs}h`;
}

const EMPTY: PolicyLiveData = {
  activity: [],
  stats: { enforced: 0, dataProcessed: "0 files", activeFor: "—" },
};

/**
 * Build the live view for a policy from its backing folder. Returns empty
 * stats/activity when the folder has no runs yet (an honest "nothing processed
 * live" state).
 */
export async function getPolicyLiveData(
  folderId: string,
): Promise<PolicyLiveData> {
  const record = await watchFolderFileStorage.getFolderData(folderId);
  const folder = await smartFolderStorage.getFolder(folderId);
  if (!record) {
    return {
      ...EMPTY,
      stats: { ...EMPTY.stats, activeFor: durationSince(folder?.createdAt) },
    };
  }

  const files: Array<[string, FolderFileMetadata]> = Object.entries(
    record.files,
  );
  const sorted = [...files].sort(
    (a, b) =>
      new Date(b[1].processedAt ?? b[1].addedAt).getTime() -
      new Date(a[1].processedAt ?? a[1].addedAt).getTime(),
  );

  const activity: PolicyActivityItem[] = sorted.slice(0, 8).map(([id, meta]) => ({
    doc: meta.name ?? id,
    action:
      meta.status === "error"
        ? (meta.errorMessage ?? "Failed")
        : meta.status === "processed"
          ? "Enforced"
          : meta.status === "processing"
            ? "Processing…"
            : "Pending",
    time: relativeTime(meta.processedAt ?? meta.addedAt),
    status: meta.status === "error" ? "flagged" : "enforced",
  }));

  const processed = files.filter(([, m]) => m.status === "processed").length;
  return {
    activity,
    stats: {
      enforced: processed,
      dataProcessed: `${files.length} ${files.length === 1 ? "file" : "files"}`,
      activeFor: durationSince(folder?.createdAt),
    },
  };
}
