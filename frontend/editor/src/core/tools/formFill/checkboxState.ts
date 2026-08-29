/**
 * One definition of "is this checkbox on", shared by the sidebar row, the page
 * overlay and the PDFium save path.
 *
 * Must stay in sync with FormUtils.isChecked (app/common) — the backend accepts
 * these spellings regardless of the widget's appearance state, so a UI that only
 * accepted the widget's own export value would render unticked boxes that the
 * backend still saves ticked.
 */
const LEGACY_ON_VALUES = new Set(["yes", "true", "1", "on", "checked"]);

/** The PDF "off" appearance state. Compared case-insensitively, as the backend does. */
const OFF_STATE = "off";

interface WidgetOnState {
  exportValue?: string | null;
}

function isLegacyOn(value: string): boolean {
  return LEGACY_ON_VALUES.has(value.trim().toLowerCase());
}

/** True when a field value that names no export state still means "on". */
export function isGenericOn(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed !== "" && trimmed.toLowerCase() !== OFF_STATE;
}

/**
 * Whether one widget renders ticked for the field's current value.
 *
 * A checkbox field's kid widgets can carry different on-states, so the answer is
 * per widget: only the kid whose export value matches is ticked.
 */
export function isWidgetChecked(
  widget: WidgetOnState | null | undefined,
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  const exportValue = widget?.exportValue;
  if (exportValue) return value === exportValue || isLegacyOn(value);
  return isGenericOn(value);
}

/**
 * Whether a field reads as ticked anywhere, for UI that has no widget in hand.
 *
 * Matches against every kid rather than the first: a field whose checked kid is
 * not kid 0 would otherwise render unticked.
 */
export function isFieldChecked(
  widgets: ReadonlyArray<WidgetOnState> | null | undefined,
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  if (widgets?.some((w) => isWidgetChecked(w, value))) return true;
  const hasExportValues = widgets?.some((w) => Boolean(w.exportValue));
  return hasExportValues ? isLegacyOn(value) : isGenericOn(value);
}
