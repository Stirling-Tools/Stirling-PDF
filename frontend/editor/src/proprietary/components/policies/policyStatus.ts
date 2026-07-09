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

/** Per-category colour for the file badges + enforcement overlay. Separate from
 *  ROW_ACCENT: the sidebar rows render neutral by design, but the badges keep
 *  their identity colours so files remain distinguishable at a glance. */
const BADGE_ACCENT: Record<string, string> = {
  ingestion: "blue",
  classification: "orange",
  security: "purple",
  compliance: "green",
  routing: "amber",
  retention: "red",
};

/**
 * CSS colour var for a policy category's badge accent (blue for unknown
 * categories) — the tint used by the file badges and the enforcement overlay.
 */
export function policyAccentVar(categoryId: string): string {
  return `var(--color-${BADGE_ACCENT[categoryId] ?? "blue"})`;
}
