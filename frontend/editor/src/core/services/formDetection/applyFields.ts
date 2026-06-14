// Apply detected fields as a real AcroForm using @cantoo/pdf-lib (the same library the rest of the
// app uses). The browser counterpart of FormUtils.addFields; coordinates are already in PDF points
// with a bottom-left origin, which is exactly what addToPage expects.

import { PDFDocument } from "@cantoo/pdf-lib";

import { DetectedField } from "@app/services/formDetection/types";

export async function applyFields(
  pdfBytes: ArrayBuffer | Uint8Array,
  fields: DetectedField[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    throwOnInvalidObject: false,
  });
  const form = pdfDoc.getForm();
  const pages = pdfDoc.getPages();
  const counts: Record<string, number> = {};

  for (const f of fields) {
    const page = pages[f.page];
    if (!page) continue;
    const r = f.rectInPdfPoints;
    if (r.w <= 0 || r.h <= 0) continue;

    const kind =
      f.type === "checkbox"
        ? "checkbox"
        : f.type === "signature"
          ? "signature"
          : "text";
    counts[kind] = (counts[kind] ?? 0) + 1;
    const name = `${kind}_${f.page + 1}_${counts[kind]}`;

    try {
      if (kind === "checkbox") {
        const cb = form.createCheckBox(name);
        cb.addToPage(page, { x: r.x, y: r.y, width: r.w, height: r.h });
      } else {
        // pdf-lib has no first-class signature widget; a text field keeps it fillable.
        const tf = form.createTextField(name);
        tf.addToPage(page, { x: r.x, y: r.y, width: r.w, height: r.h });
      }
    } catch {
      // Skip a field that fails to add (e.g. a duplicate name) rather than abort the whole doc.
    }
  }

  return pdfDoc.save();
}
