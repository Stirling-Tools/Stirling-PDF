import { useSyncExternalStore } from "react";
import type { FileId } from "@editor/types/file";
import type { AccessibilityFixTarget } from "@editor/utils/accessibilityFixes";
import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";
import { reviewLanguage } from "@editor/tools/pdfTextEditor/store/reviewLanguage";

export interface ReviewModeState {
  /** The editor is in accessibility review: tags on show, quick-tag card on. */
  reviewing: boolean;
  /** Tagging an item moves straight on to the next one still to do. */
  autoAdvance: boolean;
  /** Every item shows its outline and tag on the page; off, only the selected one does. */
  showAllTags: boolean;
  /** Where the editor should open the review, once that file is open: `target` on or after the page. */
  startAt: {
    fileId: FileId;
    pageIndex: number;
    target: AccessibilityFixTarget;
    /** Tag every page automatically (tagAllPages) before going to `target`. */
    autoTag?: boolean;
  } | null;
  /** How far an automatic tagging of every page has got; null when none runs. */
  autoTagProgress: { current: number; total: number } | null;
  /** The user asked to close; the editor answers once it has dealt with unsaved tags. */
  closeRequested: boolean;
}

let state: ReviewModeState = {
  reviewing: false,
  autoAdvance: true,
  showAllTags: true,
  startAt: null,
  closeRequested: false,
  autoTagProgress: null,
};
const listeners = new Set<() => void>();

/**
 * Whether the editor is reviewing accessibility. Module state, so a review can start
 * before the editor mounts; it lasts until closed, whatever the tool.
 */
export const reviewMode = {
  get: (): ReviewModeState => state,
  set(patch: Partial<ReviewModeState>): void {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  },
  close(): void {
    // A language the report picked for a file the review never opened would
    // otherwise apply, unasked, the next time that file is reviewed.
    reviewLanguage.set({ requested: null });
    reviewMode.set({
      reviewing: false,
      startAt: null,
      closeRequested: false,
    });
  },
  /** Closes now when no editor is open, else leaves it to the editor's prompt. */
  requestClose(): void {
    if (currentEditorSession()) reviewMode.set({ closeRequested: true });
    else reviewMode.close();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useReviewMode(): ReviewModeState {
  return useSyncExternalStore(reviewMode.subscribe, reviewMode.get);
}

/**
 * Whether a review is on, re-rendering only when that flips. While it is, the editor
 * tags but does not edit: no typing, moving, resizing, tables or inserting.
 */
export function useReviewing(): boolean {
  return useSyncExternalStore(reviewMode.subscribe, () => state.reviewing);
}
