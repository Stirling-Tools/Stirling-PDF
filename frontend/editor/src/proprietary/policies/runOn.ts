/** Per-category default for the editor event a policy enforces on. */

export type PolicyRunOn = "upload" | "export";

const DEFAULT_RUN_ON: Record<string, PolicyRunOn> = {
  security: "export",
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
