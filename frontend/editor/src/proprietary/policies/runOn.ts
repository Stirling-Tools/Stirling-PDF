/**
 * The editor event a policy enforces on, and the per-category default.
 *
 * Security defaults to "export": redaction/sanitisation exists to protect what
 * leaves the workbench, so enforcing it on the way out covers edits made after
 * upload and leaves the user's working copy untouched. Every other category
 * defaults to "upload" (enforce once, on the way in).
 */

export type PolicyRunOn = "upload" | "export";

/** Categories whose default differs from "upload". */
const DEFAULT_RUN_ON: Record<string, PolicyRunOn> = {
  security: "export",
};

/** The default enforcement event for a category. */
export function defaultRunOn(categoryId: string | undefined): PolicyRunOn {
  return DEFAULT_RUN_ON[categoryId ?? ""] ?? "upload";
}

/**
 * Coerce a persisted/wire `runOn` to a valid value, falling back to the
 * category default. An explicitly saved value always wins, so changing a
 * default never rewrites a choice the user already made.
 */
export function resolveRunOn(
  value: unknown,
  categoryId: string | undefined,
): PolicyRunOn {
  if (value === "export" || value === "upload") return value;
  return defaultRunOn(categoryId);
}
