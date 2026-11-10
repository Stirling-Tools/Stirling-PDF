/**
 * Every check the local PDF probe runs on an opened document, in two phases:
 * - Blocking (synchronous): facts that decide what an action may do, such as encryption, permissions,
 *   or `signed` for the signed-PDF edit block. They are fields on `PdfAccess`, read by
 *   `readPdfiumAccess`, and answered first; callers await only these. Each must be a fact PDFium
 *   has once the document is open, so the answer stays in milliseconds whatever the file size.
 * - Background (asynchronous): information never awaited by an action. One entry in
 *   `backgroundChecks` per key of `PdfProbeDetails`, run after the blocking answer is sent and only
 *   when `after` holds for it. Cost may grow with file size.
 * A check with both halves pairs a blocking field with a background entry gated on it: `signed`
 * blocks edits at once, and `signatures` validates them afterwards.
 *
 * Background checks run one at a time on the same document and file bytes in WASM memory, and may
 * rearrange those bytes while running as long as they restore them before resolving.
 */
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import type { PdfAccess } from "@editor/services/pdfAccessService";
import {
  readPdfiumSignatures,
  type PdfSignatureInfo,
} from "@editor/utils/pdfiumSignatures";

export interface PdfProbeDetails {
  signatures: PdfSignatureInfo[];
}

export type PdfProbeDetailKey = keyof PdfProbeDetails;

export interface OpenedPdf {
  module: WrappedPdfiumModule;
  document: number;
  file: { pointer: number; length: number };
}

type BackgroundChecks = {
  [K in PdfProbeDetailKey]: {
    after: (access: PdfAccess) => boolean;
    run: (pdf: OpenedPdf) => Promise<PdfProbeDetails[K]>;
  };
};

export const backgroundChecks: BackgroundChecks = {
  signatures: {
    after: (access) => access.signed,
    run: ({ module, document, file }) =>
      readPdfiumSignatures(module, document, file),
  },
};

const detailKeys = Object.keys(backgroundChecks) as PdfProbeDetailKey[];

export function backgroundChecksAfter(access: PdfAccess): PdfProbeDetailKey[] {
  return detailKeys.filter((key) => backgroundChecks[key].after(access));
}

export async function runBackgroundCheck<K extends PdfProbeDetailKey>(
  key: K,
  pdf: OpenedPdf,
): Promise<Partial<PdfProbeDetails>> {
  const details: Partial<PdfProbeDetails> = {};
  details[key] = await backgroundChecks[key].run(pdf);
  return details;
}
