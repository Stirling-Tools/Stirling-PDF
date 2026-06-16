/**
 * Maps real backend policy runs (from policyRunStore) into the detail view's
 * activity feed + summary stats. Runs are produced by the auto-run controller
 * firing `/api/v1/policies/{id}/run` on every uploaded file, so the feed is the
 * policy's actual enforcement history — not a cosmetic file listing.
 */

import type { PolicyActivityItem, PolicyStats } from "@app/types/policies";
import type { PolicyRunRecord } from "@app/components/policies/policyRunStore";

/** Relative "Nm/Nh ago" for an activity timestamp (epoch ms). */
function relativeTime(ts: number): string {
  if (!ts) return "—";
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

/** Duration since a timestamp, e.g. "18d" / "5h" (no "ago"). */
function durationSince(ts: number): string {
  const ms = Date.now() - ts;
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d`;
  const hrs = Math.floor(ms / 3600000);
  return hrs >= 1 ? `${hrs}h` : "Today";
}

/**
 * Human byte size, e.g. "2.1 MB". Intentionally NOT core `formatFileSize`:
 * that one renders 2 decimals (`2.13 MB`), whereas the policy summary wants
 * the quieter whole-number / single-decimal form used across this surface.
 */
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

/** Map a run's lifecycle status to an activity row's display status. */
function activityStatus(run: PolicyRunRecord): PolicyActivityItem["status"] {
  if (run.status === "COMPLETED") return "enforced";
  // A queue-rejected run awaiting auto-retry is transient backpressure, not a failure.
  if (run.retrying) return "processing";
  if (run.status === "FAILED" || run.status === "CANCELLED") return "flagged";
  return "processing";
}

function activityAction(run: PolicyRunRecord): string {
  switch (activityStatus(run)) {
    case "enforced":
      return `${formatBytes(run.fileSize)} • enforced`;
    case "flagged":
      return run.error ?? "Enforcement failed";
    default: {
      if (run.retrying) return "Busy — retrying…";
      // Show pipeline progress while running, once the status endpoint reports
      // it — turns a static "Enforcing…" into visible movement on slow steps.
      const { currentStep, stepCount } = run;
      return currentStep && stepCount
        ? `Enforcing… · step ${currentStep}/${stepCount}`
        : "Enforcing…";
    }
  }
}

/** Build the detail view's activity feed from a category's runs (newest first). */
export function runsToActivity(runs: PolicyRunRecord[]): PolicyActivityItem[] {
  return runs.map((run) => ({
    doc: run.fileName,
    action: activityAction(run),
    time: relativeTime(run.startedAt),
    status: activityStatus(run),
    runId: run.runId,
    fileId: run.fileId,
  }));
}

/** Build the summary stats from a category's runs. */
export function runsToStats(
  runs: PolicyRunRecord[],
  folderCreatedAt: string | undefined,
): PolicyStats {
  const enforced = runs.filter((r) => r.status === "COMPLETED");
  const bytes = enforced.reduce((sum, r) => sum + (r.fileSize ?? 0), 0);
  return {
    enforced: enforced.length,
    dataProcessed: formatBytes(bytes),
    activeFor: policyActiveFor(folderCreatedAt),
  };
}

/**
 * How long a policy has been active — from its backing folder's creation time
 * (when it was enabled), or "Today" when there's no folder yet.
 */
export function policyActiveFor(folderCreatedAt: string | undefined): string {
  if (!folderCreatedAt) return "Today";
  return durationSince(new Date(folderCreatedAt).getTime());
}
