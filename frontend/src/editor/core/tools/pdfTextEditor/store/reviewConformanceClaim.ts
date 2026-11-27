import { useSyncExternalStore } from "react";
import type { FileId } from "@editor/types/file";
import type { PdfUaPart } from "@editor/tools/pdfTextEditor/pdfdoc/passes/conformanceClaim";

/** The PDF/UA claim of the file the review has open, for the accessibility report. */
export interface ReviewConformanceClaim {
  fileId: FileId;
  /** The declared part, unsaved edits included; null for none. */
  part: number | null;
  /** False when the save cannot write it, as for an encrypted file. */
  editable: boolean;
  /** Changes the claim as an undoable edit, written by the review's next save. */
  set: (part: PdfUaPart | null) => void;
}

let claim: ReviewConformanceClaim | null = null;
const listeners = new Set<() => void>();

/** Module state because the report and the review mount in separate trees. */
export const reviewConformanceClaim = {
  get: (): ReviewConformanceClaim | null => claim,
  set(next: ReviewConformanceClaim | null): void {
    claim = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useReviewConformanceClaim(): ReviewConformanceClaim | null {
  return useSyncExternalStore(
    reviewConformanceClaim.subscribe,
    reviewConformanceClaim.get,
    reviewConformanceClaim.get,
  );
}
