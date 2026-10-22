import type { FormField } from "@app/tools/formFill/types";

/**
 * Maps radio button values from the UI's widget-index representation ("0", "1", ...)
 * back to the canonical export value or appearance state expected by backend endpoints
 * and file export formats (JSON, CSV, XLSX).
 */
export function resolveCanonicalFormValues(
  fields: FormField[],
  values: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = { ...values };
  for (const field of fields) {
    if (field.type === "radio" && field.name in result) {
      const val = result[field.name];
      if (val !== undefined && val !== null && val !== "") {
        const idx = parseInt(val, 10);
        if (
          !isNaN(idx) &&
          field.widgets &&
          idx >= 0 &&
          idx < field.widgets.length
        ) {
          const exportVal =
            field.widgets[idx]?.exportValue ?? field.options?.[idx];
          if (
            exportVal !== undefined &&
            exportVal !== null &&
            exportVal !== ""
          ) {
            result[field.name] = exportVal;
          }
        }
      }
    }
  }
  return result;
}

/**
 * Maps a radio button's raw export value (or appearance state name)
 * to the corresponding widget index string ("0", "1", ...) used by the UI.
 * If the value is already a matching index or cannot be resolved, returns the original value.
 */
export function resolveRadioWidgetIndex(
  field: FormField,
  value: string | undefined | null,
): string {
  if (
    !value ||
    field.type !== "radio" ||
    !field.widgets ||
    field.widgets.length === 0
  ) {
    return value ?? "";
  }
  const idx = field.widgets.findIndex(
    (w, i) =>
      w.exportValue === value || (field.options && field.options[i] === value),
  );
  return idx !== -1 ? String(idx) : value;
}
