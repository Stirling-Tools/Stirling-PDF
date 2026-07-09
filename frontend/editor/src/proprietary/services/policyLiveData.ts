/**
 * Maps real backend policy runs (from policyRunStore) into the detail view's
 * activity feed + summary stats. Runs are produced by the auto-run controller
 * firing `/api/v1/policies/{id}/run` on every uploaded file, so the feed is the
 * policy's actual enforcement history — not a cosmetic file listing.
 */

import i18n from "@app/i18n";
import type { PolicyActivityItem, PolicyStats } from "@app/types/policies";
import {
  dispatchKey,
  isRunInFlight,
  type PolicyRunRecord,
} from "@app/components/policies/policyRunStore";

/**
 * The failed runs that are actually worth re-running, one per (policy, file):
 *  - terminal-failed (FAILED/CANCELLED) and not already in an auto-retry backoff;
 *  - with a local input file to re-run on (reconciled server orphans have none);
 *  - EXCLUDING any (policy, file) that has since succeeded or is currently
 *    running — a stale failure row must never re-enforce a file that already
 *    went through, or race a run that's still going.
 * Runs are newest-first in the store, so the first failed run seen per key is
 * the latest attempt. This is the groundwork for bulk "retry all failed" and,
 * later, "run a newly-enabled policy across not-yet-processed files".
 */
export function retryableFailedRuns(
  runs: PolicyRunRecord[],
): PolicyRunRecord[] {
  // Keys settled by a success or still being worked — off-limits for retry.
  const settledOrActive = new Set<string>();
  for (const run of runs) {
    if (run.status === "COMPLETED" || isRunInFlight(run)) {
      settledOrActive.add(dispatchKey(run.categoryId, run.fileId));
    }
  }
  const seen = new Set<string>();
  const eligible: PolicyRunRecord[] = [];
  for (const run of runs) {
    if (run.status !== "FAILED" && run.status !== "CANCELLED") continue;
    if (run.retrying) continue;
    if (!run.fileId) continue;
    const key = dispatchKey(run.categoryId, run.fileId);
    if (settledOrActive.has(key) || seen.has(key)) continue;
    seen.add(key);
    eligible.push(run);
  }
  return eligible;
}

/** Live per-policy run tally — drives the panel's processing ring + counts. */
export interface PolicyRunProgress {
  /** Runs still working: dispatched/running, retrying, or done-but-not-imported. */
  running: number;
  /** Runs that finished successfully AND landed in the workspace. */
  completed: number;
  /** Every run in the current wave for the policy (running + completed + failed). */
  total: number;
}

/** Empty tally, so callers can render a zero state without null checks. */
export const EMPTY_RUN_PROGRESS: PolicyRunProgress = {
  running: 0,
  completed: 0,
  total: 0,
};

/**
 * Tally runs per policy category for the panel's live indicators: how many are
 * still processing, how many completed, and the total in the CURRENT wave.
 * Keyed by categoryId.
 *
 * `sinceStartedAt` scopes to the current upload wave (the store resets it when a
 * run starts with nothing in flight) so the counts reflect "this upload", not the
 * whole run history persisted in localStorage across every past upload.
 */
export function progressByCategory(
  runs: PolicyRunRecord[],
  sinceStartedAt = 0,
): Map<string, PolicyRunProgress> {
  const byCat = new Map<string, PolicyRunProgress>();
  for (const run of runs) {
    if (run.startedAt < sinceStartedAt) continue;
    const p = byCat.get(run.categoryId) ?? {
      running: 0,
      completed: 0,
      total: 0,
    };
    p.total += 1;
    if (isRunInFlight(run)) p.running += 1;
    else if (run.status === "COMPLETED") p.completed += 1;
    byCat.set(run.categoryId, p);
  }
  return byCat;
}

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
      return `${formatBytes(run.fileSize)} • ${i18n.t("policies.activity.enforced", "enforced")}`;
    case "flagged":
      return (
        run.error ?? i18n.t("policies.activity.failed", "Enforcement failed")
      );
    default: {
      if (run.retrying)
        return i18n.t("policies.activity.retrying", "Busy, retrying...");
      const enforcing = i18n.t("policies.activity.enforcing", "Enforcing...");
      // Show pipeline progress while running, once the status endpoint reports it
      const { currentStep, stepCount } = run;
      return currentStep && stepCount
        ? `${enforcing} · ${i18n.t("policies.activity.step", "step {{current}}/{{total}}", { current: currentStep, total: stepCount })}`
        : enforcing;
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
