// Orchestrates the in-browser engine: fetch+cache the model, render each page, preprocess, run
// onnxruntime-web, decode, map to PDF points, then build the fillable AcroForm - entirely on the
// device, so the PDF never leaves the browser. Mirrors FormDetectionController.detect server-side.

import { FormDetectionCatalogEntry } from "@app/hooks/useFormDetectionModelStatus";

import { applyFields } from "@app/services/formDetection/applyFields";
import { toPdfPoints } from "@app/services/formDetection/coordinateMapping";
import { decode } from "@app/services/formDetection/decode";
import { loadModelBytes } from "@app/services/formDetection/modelCache";
import { getSession, runInference } from "@app/services/formDetection/onnxSession";
import { renderPages } from "@app/services/formDetection/pdfRender";
import { preprocess } from "@app/services/formDetection/preprocess";
import { DetectedField, resolveSpec } from "@app/services/formDetection/types";

export interface BrowserDetectResult {
  fields: DetectedField[];
  appliedPdf: Uint8Array;
}

export async function runBrowserDetection(
  pdfBytes: ArrayBuffer,
  activeEntry: FormDetectionCatalogEntry,
  confThreshold?: number,
): Promise<BrowserDetectResult> {
  const spec = resolveSpec(activeEntry);
  const score =
    typeof confThreshold === "number" ? confThreshold : spec.scoreThreshold;

  const modelBytes = await loadModelBytes(activeEntry.sha256);
  const session = await getSession(
    modelBytes,
    activeEntry.sha256 || activeEntry.id,
  );

  const fieldType = (classId: number): string => {
    const types = spec.classFieldTypes;
    return types && classId >= 0 && classId < types.length
      ? types[classId]
      : "text";
  };

  // pdf.js may detach the input buffer, so give each consumer its own copy.
  const pages = await renderPages(pdfBytes.slice(0), spec.inputSize);
  const fields: DetectedField[] = [];
  for (const page of pages) {
    const pre = preprocess(page.rgba, page.widthPx, page.heightPx, spec);
    const out = await runInference(session, pre.chw, spec.inputSize);
    for (const d of decode(out, spec, pre, score)) {
      fields.push({
        type: fieldType(d.classId),
        page: page.pageIndex,
        rectInPdfPoints: toPdfPoints(d, page),
        confidence: d.score,
      });
    }
  }

  const appliedPdf = await applyFields(pdfBytes.slice(0), fields);
  return { fields, appliedPdf };
}
