import { useSyncExternalStore } from "react";
import type { FileId } from "@editor/types/file";

/**
 * Carries the document language between the accessibility report and the review's
 * editor. The report asks for a language; the editor applies it as an undoable
 * step, and reports the language its open file has now.
 */
export interface ReviewLanguageState {
  /** The review's open file and its language, unsaved edits included. */
  open: { fileId: FileId; language: string | null; editable: boolean } | null;
  /** A language the report picked, waiting for the review to open its file. */
  requested: { fileId: FileId; language: string | null } | null;
}

let state: ReviewLanguageState = { open: null, requested: null };
const listeners = new Set<() => void>();

export const reviewLanguage = {
  get: (): ReviewLanguageState => state,
  set(patch: Partial<ReviewLanguageState>): void {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useReviewLanguage(): ReviewLanguageState {
  return useSyncExternalStore(
    reviewLanguage.subscribe,
    reviewLanguage.get,
    reviewLanguage.get,
  );
}
