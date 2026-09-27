/**
 * The backend returns signature fields but cannot render their appearance; PDFium rasterises it
 * separately. Merge the two BY NAME, never concatenate, or the signature is listed twice.
 */
import type { FormField, WidgetCoordinates } from "@app/tools/formFill/types";

const sameWidget = (a: WidgetCoordinates, b: WidgetCoordinates): boolean =>
  a.pageIndex === b.pageIndex &&
  a.x === b.x &&
  a.y === b.y &&
  a.width === b.width &&
  a.height === b.height &&
  (a.exportValue ?? "") === (b.exportValue ?? "");

/** Appends the widgets a field does not have yet, page-ordered. */
export function mergeWidgetLists(
  existing: WidgetCoordinates[] | null | undefined,
  incoming: WidgetCoordinates[] | null | undefined,
): WidgetCoordinates[] {
  const merged = [...(existing ?? [])];
  for (const widget of incoming ?? []) {
    if (!merged.some((w) => sameWidget(w, widget))) merged.push(widget);
  }
  // The fill counts widgets page by page, so keep the merged list in page
  // order however the pages happened to load.
  merged.sort((a, b) => a.pageIndex - b.pageIndex);
  return merged;
}

/**
 * Radio values are indices into the widget list, and a merge can reorder that
 * list, so the checked widget is re-resolved against the merged order. Other
 * field types and unchecked radios (an empty value) keep their value.
 */
export function remapRadioValue(
  field: Pick<FormField, "type" | "value" | "widgets">,
  mergedWidgets: WidgetCoordinates[],
): string {
  if (field.type !== "radio" || !field.value) return field.value;
  const checked = (field.widgets ?? [])[Number(field.value)];
  if (!checked) return field.value;
  const index = mergedWidgets.findIndex((w) => sameWidget(w, checked));
  return index >= 0 ? String(index) : field.value;
}

/**
 * The `MERGE_PAGE_FIELDS` reducer body, also used to keep the synchronous
 * `fieldsRef` in step with the reducer when a page load merges.
 */
export function mergePageFields(
  current: FormField[],
  pageFields: FormField[],
): FormField[] {
  const fieldMap = new Map(current.map((f) => [f.name, f]));
  for (const newField of pageFields) {
    const existing = fieldMap.get(newField.name);
    if (!existing) {
      fieldMap.set(newField.name, newField);
      continue;
    }
    const mergedWidgets = mergeWidgetLists(existing.widgets, newField.widgets);
    // A radio value is the checked widget's index. Whichever side has a
    // checked widget is re-resolved against the merged order, so a page that
    // loads later cannot leave the value pointing at the wrong widget.
    const value =
      existing.type === "radio"
        ? remapRadioValue(
            existing.value || !newField.value ? existing : newField,
            mergedWidgets,
          )
        : existing.value;
    fieldMap.set(newField.name, {
      ...existing,
      widgets: mergedWidgets,
      value,
    });
  }
  return Array.from(fieldMap.values());
}

/** Copies each pdfium `appearanceDataUrl` onto the same-named backend field, appending unmatched ones. */
export function mergeSignatureAppearances(
  backendFields: FormField[],
  signatureFields: FormField[],
): FormField[] {
  if (signatureFields.length === 0) return backendFields;

  const merged = backendFields.map((f) => ({ ...f }));
  const byName = new Map(merged.map((f) => [f.name, f]));

  for (const sig of signatureFields) {
    const existing = byName.get(sig.name);
    if (existing) {
      if (sig.appearanceDataUrl && !existing.appearanceDataUrl) {
        existing.appearanceDataUrl = sig.appearanceDataUrl;
      }
    } else {
      merged.push({ ...sig });
      byName.set(sig.name, merged[merged.length - 1]);
    }
  }

  return merged;
}
