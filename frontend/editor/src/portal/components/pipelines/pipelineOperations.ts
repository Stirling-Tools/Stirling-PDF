/**
 * The operation catalogue the composer builds a pipeline from. Each entry's
 * `operation` is a real Stirling endpoint path (the backend's PipelineStep
 * contract) with sensible default `parameters`, so a composed pipeline is
 * runnable as-is. Per-operation parameter editing is intentionally out of scope
 * for this version: the composer chains operations with their defaults. Labels
 * are derived from the path, so adding an operation needs no translation work.
 */

export interface PipelineOperationDef {
  /** Stirling endpoint path, e.g. "/api/v1/misc/compress-pdf". */
  operation: string;
  /** Scalar form fields the endpoint accepts; defaults that keep the step valid. */
  parameters: Record<string, unknown>;
}

export const PIPELINE_OPERATIONS: PipelineOperationDef[] = [
  { operation: "/api/v1/misc/ocr-pdf", parameters: {} },
  { operation: "/api/v1/misc/compress-pdf", parameters: {} },
  { operation: "/api/v1/misc/flatten", parameters: {} },
  { operation: "/api/v1/misc/repair", parameters: {} },
  {
    operation: "/api/v1/security/auto-redact",
    parameters: { mode: "automatic", convertPDFToImage: true },
  },
  {
    operation: "/api/v1/security/sanitize-pdf",
    parameters: { removeJavaScript: true },
  },
  { operation: "/api/v1/security/add-watermark", parameters: {} },
  { operation: "/api/v1/security/add-password", parameters: {} },
  { operation: "/api/v1/security/remove-password", parameters: {} },
  { operation: "/api/v1/general/merge-pdfs", parameters: {} },
  { operation: "/api/v1/misc/add-stamp", parameters: {} },
  { operation: "/api/v1/misc/add-page-numbers", parameters: {} },
];

/**
 * Turn an endpoint path into a display label: take the last segment, drop the
 * "pdf"/"pdfs" filler words, and title-case the rest.
 * "/api/v1/misc/compress-pdf" → "Compress"; "/api/v1/security/auto-redact" →
 * "Auto Redact". Works for any operation, including ones loaded from the backend
 * that aren't in the catalogue above.
 */
export function humanizeOperation(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? path;
  const words = last.split("-").filter((w) => w !== "pdf" && w !== "pdfs");
  const base = (words.length > 0 ? words : [last]).join(" ");
  return base.replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
