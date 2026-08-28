/**
 * Restrained, professional palette for the form overlays.
 *
 * Deliberately NOT a per-type rainbow: existing fields read as neutral slate,
 * the active/selected field and newly-drawn fields use a single blue accent,
 * deletions are red. The field TYPE is conveyed by the small icon in the side
 * panel, not by a saturated fill colour on the page.
 *
 * All values are semantic CSS custom properties so they adapt to the active
 * theme (light/dark) automatically when used as inline style values.
 */
export const FORM_COLORS = {
  /** Selected / active / newly-drawn fields. */
  accent: "var(--c-primary)",
  accentFillSoft: "var(--c-primary-subtle)",
  accentFill: "var(--c-primary-subtle)",

  /** Existing (unselected) fields — visible slate so the page stays readable. */
  neutralBorder: "var(--c-border)",
  neutralFill: "var(--c-hover)",
  neutralChip: "var(--c-text-muted)",

  /** Fields marked for deletion. */
  danger: "var(--c-danger)",
  dangerFill: "var(--c-hover)",

  /** Alignment guides (thin lines, shown only while dragging). */
  guide: "var(--c-primary)",
} as const;
