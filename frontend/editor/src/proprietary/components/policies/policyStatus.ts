import type { IconBadgeAccent } from "@app/ui/IconBadge";

/**
 * Per-category accent colour
 */
export const ROW_ACCENT: Record<string, IconBadgeAccent> = {
  ingestion: "blue",
  security: "purple",
  compliance: "green",
  routing: "amber",
  retention: "red",
};

/** Accent name → the CSS colour var the policy badges tint with. */
const ACCENT_VAR: Record<string, string> = {
  blue: "var(--color-blue)",
  purple: "var(--color-purple)",
  green: "var(--color-green)",
  amber: "var(--color-amber)",
  red: "var(--color-red)",
};

/** CSS colour var for a policy category's accent (blue for unknown categories). */
export function policyAccentVar(categoryId: string): string {
  return ACCENT_VAR[ROW_ACCENT[categoryId] ?? "blue"];
}
