import { useSyncExternalStore } from "react";
import type { FileId } from "@editor/types/file";

/** Whether the file the review has open declares itself tagged, for the accessibility report. */
export interface ReviewMarkedTagged {
  fileId: FileId;
  /** Unsaved edits included. */
  marked: boolean;
  /** False when the save cannot write it, as for an encrypted file. */
  editable: boolean;
  /** Changes the flag as an undoable edit, written by the review's next save. */
  set: (marked: boolean) => void;
}

let flag: ReviewMarkedTagged | null = null;
const listeners = new Set<() => void>();

/** Module state because the report and the review mount in separate trees. */
export const reviewMarkedTagged = {
  get: (): ReviewMarkedTagged | null => flag,
  set(next: ReviewMarkedTagged | null): void {
    flag = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useReviewMarkedTagged(): ReviewMarkedTagged | null {
  return useSyncExternalStore(
    reviewMarkedTagged.subscribe,
    reviewMarkedTagged.get,
    reviewMarkedTagged.get,
  );
}
