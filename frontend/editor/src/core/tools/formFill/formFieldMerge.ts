/**
 * Merge helpers for assembling the form field list shown to the user.
 *
 * In pdfbox mode the backend already returns every field (including signature
 * fields), but it cannot render a signature's visual appearance. The frontend
 * separately rasterises signature appearances via PDFium. These must be merged
 * BY NAME — enriching the existing backend entry with the rendered appearance —
 * rather than concatenated, otherwise a signature appears twice in the list.
 */
import type { FormField } from "@app/tools/formFill/types";

/**
 * Returns a new array where each pdfium-rendered signature field either enriches
 * the matching backend field (by name) with its `appearanceDataUrl`, or is
 * appended if the backend didn't return it. Never produces duplicates by name.
 */
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
