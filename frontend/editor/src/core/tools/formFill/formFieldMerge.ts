/**
 * The backend returns signature fields but cannot render their appearance; PDFium rasterises it
 * separately. Merge the two BY NAME, never concatenate, or the signature is listed twice.
 */
import type { FormField } from "@app/tools/formFill/types";

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
