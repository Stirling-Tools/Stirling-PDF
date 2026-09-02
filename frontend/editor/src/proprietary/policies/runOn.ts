/** Per-category default for the editor event a policy enforces on. */

export type PolicyRunOn = "upload" | "export";

const DEFAULT_RUN_ON: Record<string, PolicyRunOn> = {
  security: "export",
  // Compliance is an archival gate: convert to PDF/A and validate the document
  // that actually ships, so it enforces on export like security.
  compliance: "export",
};

export function defaultRunOn(categoryId: string | undefined): PolicyRunOn {
  return DEFAULT_RUN_ON[categoryId ?? ""] ?? "upload";
}

/** An explicitly saved value wins; anything else falls back to the default. */
export function resolveRunOn(
  value: unknown,
  categoryId: string | undefined,
): PolicyRunOn {
  if (value === "export" || value === "upload") return value;
  return defaultRunOn(categoryId);
}
