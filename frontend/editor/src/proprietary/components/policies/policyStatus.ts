import type { IconBadgeAccent } from "@app/ui/IconBadge";
import type { PolicyRowStatus, PolicyState } from "@app/types/policies";

/** Derive a single row/detail status from a policy's persisted state. */
export function deriveRowStatus(
  state: PolicyState | undefined,
): PolicyRowStatus {
  if (!state?.configured) return "setup";
  if (state.status === "paused") return "paused";
  return "active";
}

/** Human label for each row status. */
export const STATUS_LABEL: Record<PolicyRowStatus, string> = {
  active: "Active",
  paused: "Paused",
  setup: "Set up",
};

/** Per-category icon accent — neutral (no tint background) across all categories. */
export const ROW_ACCENT: Record<string, IconBadgeAccent> = {
  ingestion: "neutral",
  security: "neutral",
  compliance: "neutral",
  routing: "neutral",
  retention: "neutral",
};
