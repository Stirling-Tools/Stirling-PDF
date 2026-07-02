/**
 * Derives display data from raw backend `PolicyRunView` records. The backend
 * `GET /api/v1/policies/runs` endpoint returns these; both the portal and
 * (eventually) the editor read this same derivation rather than duplicating it.
 */

import type {
  PolicyActivityItem,
  PolicyRunView,
  PolicyStats,
} from "@shared/policies/types";

function relativeTime(epochMs: number): string {
  if (!epochMs) return "Just now";
  const mins = Math.floor((Date.now() - epochMs) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function durationSince(epochMs: number): string {
  if (!epochMs) return "—";
  const ms = Date.now() - epochMs;
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d`;
  const hrs = Math.floor(ms / 3600000);
  return hrs >= 1 ? `${hrs}h` : "Today";
}

function activityStatus(run: PolicyRunView): PolicyActivityItem["status"] {
  if (run.status === "COMPLETED") return "enforced";
  if (run.status === "FAILED" || run.status === "CANCELLED") return "flagged";
  return "processing";
}

function activityAction(run: PolicyRunView): string {
  const s = activityStatus(run);
  if (s === "enforced") return "Enforced";
  if (s === "flagged") return run.error ?? "Enforcement failed";
  const { currentStep, stepCount } = run;
  return currentStep && stepCount
    ? `Enforcing… · step ${currentStep}/${stepCount}`
    : "Enforcing…";
}

export function runsToActivity(runs: PolicyRunView[]): PolicyActivityItem[] {
  return runs.map((run) => ({
    doc: run.outputs[0]?.fileName ?? "Policy run",
    action: activityAction(run),
    time: relativeTime(run.createdAt),
    status: activityStatus(run),
  }));
}

export function runsToStats(runs: PolicyRunView[]): PolicyStats {
  const completed = runs.filter((r) => r.status === "COMPLETED");
  const oldest = runs.reduce((min, r) => Math.min(min, r.createdAt), Infinity);
  return {
    enforced: completed.length,
    dataProcessed: "—",
    activeFor: isFinite(oldest) ? durationSince(oldest) : "—",
  };
}
