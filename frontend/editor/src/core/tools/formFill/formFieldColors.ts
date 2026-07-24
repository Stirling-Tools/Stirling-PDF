/**
 * Restrained, professional palette for the form overlays.
 *
 * Deliberately NOT a per-type rainbow: existing fields read as neutral slate,
 * the active/selected field and newly-drawn fields use a single blue accent,
 * deletions are red. The field TYPE is conveyed by the small icon in the side
 * panel, not by a saturated fill colour on the page.
 */
export const FORM_COLORS = {
  /** Selected / active / newly-drawn fields. */
  accent: "#2563eb",
  accentFillSoft: "rgba(37, 99, 235, 0.06)",
  accentFill: "rgba(37, 99, 235, 0.10)",

  /** Existing (unselected) fields — quiet slate so the page stays readable. */
  neutralBorder: "rgba(71, 85, 105, 0.55)",
  neutralFill: "rgba(71, 85, 105, 0.05)",
  neutralChip: "#475569",

  /** Fields marked for deletion. */
  danger: "#dc2626",
  dangerFill: "rgba(220, 38, 38, 0.08)",

  /** Alignment guides (thin lines, shown only while dragging). */
  guide: "#2563eb",
} as const;
