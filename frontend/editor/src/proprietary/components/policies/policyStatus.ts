import type { IconBadgeAccent } from "@shared/components/IconBadge";
import type { PolicyRowStatus, PolicyState } from "@app/types/policies";

/** Derive a single row/detail status, treating a spend-limit hit as paused. */
export function deriveRowStatus(
  state: PolicyState | undefined,
  spendReached: boolean,
): PolicyRowStatus {
  if (!state?.configured) return "setup";
  if (spendReached || state.status === "paused") return "paused";
  return "active";
}

/** Human label for each row status. */
export const STATUS_LABEL: Record<PolicyRowStatus, string> = {
  active: "Active",
  paused: "Paused",
  setup: "Set up",
};

/** A soft tinted icon tile per category — gives each policy a calm identity colour. */
export const ROW_ACCENT: Record<string, IconBadgeAccent> = {
  ingestion: "blue",
  security: "purple",
  compliance: "green",
  routing: "amber",
  retention: "red",
};
