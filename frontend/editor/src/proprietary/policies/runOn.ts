/** Per-category default for the editor event a policy enforces on. */

import type { PolicyState } from "@app/types/policies";

export type PolicyRunOn = "upload" | "export";

const DEFAULT_RUN_ON: Record<string, PolicyRunOn> = {
  security: "export",
  // Compliance is an archival gate: convert to PDF/A and validate the document
  // that actually ships, so it enforces on export like security.
  compliance: "export",
};

export function defaultRunOn(policyKey: string | undefined): PolicyRunOn {
  return DEFAULT_RUN_ON[policyKey ?? ""] ?? "upload";
}

/** An explicitly saved value wins; anything else falls back to the default. */
export function resolveRunOn(
  value: unknown,
  policyKey: string | undefined,
): PolicyRunOn {
  if (value === "export" || value === "upload") return value;
  return defaultRunOn(policyKey);
}

/**
 * The editor event this policy fires on, or null when the editor never runs it.
 * runOn is already resolved by codec.ts, so an unset value means "upload".
 */
export function editorTriggerOf(
  state: PolicyState | undefined,
): PolicyRunOn | null {
  if (!state?.configured || !state.enabled || !state.backendId) return null;
  if (!state.runsOnEditor) return null;
  return state.runOn === "export" ? "export" : "upload";
}
