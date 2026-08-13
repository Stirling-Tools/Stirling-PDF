// Orchestrates the in-browser engine: fetch+cache the model, render each page, preprocess, run
// onnxruntime-web, decode, map to PDF points, then build the fillable AcroForm - entirely on the
// device, so the PDF never leaves the browser. Mirrors FormDetectionController.detect server-side.

import { FormDetectionCatalogEntry } from "@app/hooks/useFormDetectionModelStatus";

import { applyFields } from "@app/services/formDetection/applyFields";
import { toPdfPoints } from "@app/services/formDetection/coordinateMapping";
import { decode, decodeRfDetr } from "@app/services/formDetection/decode";
import { loadModelBytes } from "@app/services/formDetection/modelCache";
import {
  getSession,
  runInference,
} from "@app/services/formDetection/onnxSession";
import { renderPages } from "@app/services/formDetection/pdfRender";
import { preprocess } from "@app/services/formDetection/preprocess";
import {
  DetectedField,
  Detection,
  ModelPipelineSpec,
  Preprocessed,
  RawOutput,
  resolveSpec,
} from "@app/services/formDetection/types";
import { DetectionStage } from "@app/services/formDetection/progress";

// Kept in lockstep with FormDetectionController.MAX_PAGES / MAX_FIELDS.
export const MAX_PAGES = 500;
export const MAX_FIELDS = 2000;

export interface BrowserDetectResult {
  fields: DetectedField[];
  appliedPdf: Uint8Array;
  pageCount: number;
}

export async function runBrowserDetection(
  pdfBytes: ArrayBuffer,
  activeEntry: FormDetectionCatalogEntry,
  confThreshold?: number,
  onStage?: (stage: DetectionStage) => void,
): Promise<BrowserDetectResult> {
  const spec = resolveSpec(activeEntry);
  const score =
    typeof confThreshold === "number" && Number.isFinite(confThreshold)
      ? Math.min(1, Math.max(0, confThreshold))
      : spec.scoreThreshold;

  const modelBytes = await loadModelBytes(
    activeEntry.sha256,
    (loadedBytes, totalBytes) =>
      onStage?.({ kind: "model-download", loadedBytes, totalBytes }),
  );
  onStage?.({ kind: "model-init" });
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
  const pages = await renderPages(
    pdfBytes.slice(0),
    spec.inputSize,
    (page, pageCount) => {
      if (pageCount > MAX_PAGES) {
        throw new Error(
          `PDF has ${pageCount} pages; the limit is ${MAX_PAGES}`,
        );
      }
      onStage?.({ kind: "rendering", page, pageCount });
    },
  );
  let fields: DetectedField[] = [];
  for (const page of pages) {
    onStage?.({
      kind: "analyzing",
      page: page.pageIndex + 1,
      pageCount: pages.length,
    });
    const pre = preprocess(page.rgba, page.widthPx, page.heightPx, spec);
    const out = await runInference(session, pre.chw, spec.inputSize);
    for (const d of decodeFor(spec, out, pre, score)) {
      const rect = toPdfPoints(d, page);
      if (rect.w <= 0 || rect.h <= 0) {
        continue;
      }
      fields.push({
        type: fieldType(d.classId),
        page: page.pageIndex,
        rectInPdfPoints: rect,
        confidence: d.score,
      });
    }
  }
  if (fields.length > MAX_FIELDS) {
    fields = fields
      .slice()
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_FIELDS);
  }

  onStage?.({ kind: "applying" });
  const appliedPdf = await applyFields(pdfBytes.slice(0), fields);
  return { fields, appliedPdf, pageCount: pages.length };
}

/**
 * Pick the decoder the model's head needs, mirroring FormDetectionController.decodeFor.
 * Unknown values fall back to YOLO, which is what every entry was before a second head existed.
 */
function decodeFor(
  spec: ModelPipelineSpec,
  outputs: Record<string, RawOutput>,
  pre: Preprocessed,
  score: number,
): Detection[] {
  if ((spec.decoder ?? "").toLowerCase() === "rfdetr") {
    return decodeRfDetr(outputs, spec, pre, score);
  }
  // Single-output head: take the sole tensor whatever the graph calls it.
  return decode(Object.values(outputs)[0], spec, pre, score);
}
