import type { IconBadgeAccent } from "@app/ui/IconBadge";

/**
 * Per-category accent colour
 */
export const ROW_ACCENT: Record<string, IconBadgeAccent> = {
  ingestion: "blue",
  classification: "orange",
  security: "purple",
  compliance: "green",
  routing: "amber",
  retention: "red",
};

/**
 * CSS colour var for a policy category's accent (blue for unknown categories) —
 * the tint used by the file badges and the enforcement overlay.
 *
 * Derived straight from the accent name (`--color-<accent>`), which is exactly
 * the token {@link IconBadge} uses for the same accent. Deriving it (rather than
 * keeping a second name→var map) means the badge tint can never drift from the
 * sidebar's colour — previously `orange` was missing from that map, so the
 * Classification badge/overlay rendered untinted while its sidebar row was orange.
 */
export function policyAccentVar(categoryId: string): string {
  return `var(--color-${ROW_ACCENT[categoryId] ?? "blue"})`;
}
