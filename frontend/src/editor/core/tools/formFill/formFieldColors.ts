/**
 * Form overlay palette, deliberately not per-type: slate = existing, blue = selected/new, red =
 * delete. Field type is conveyed by the side-panel icon, not by a fill colour on the page.
 */
export const FORM_COLORS = {
  /** Selected / active / newly-drawn fields. */
  accent: "#2563eb",
  accentFillSoft: "rgba(37, 99, 235, 0.06)",
  accentFill: "rgba(37, 99, 235, 0.10)",

  /** Existing (unselected) fields - quiet slate so the page stays readable. */
  neutralBorder: "rgba(71, 85, 105, 0.55)",
  neutralFill: "rgba(71, 85, 105, 0.05)",
  neutralChip: "#475569",

  /** Fields marked for deletion. */
  danger: "#dc2626",
  dangerFill: "rgba(220, 38, 38, 0.08)",

  /** Alignment guides (thin lines, shown only while dragging). */
  guide: "#2563eb",
} as const;
