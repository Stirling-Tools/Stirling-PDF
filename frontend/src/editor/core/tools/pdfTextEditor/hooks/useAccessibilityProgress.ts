import { useCallback, useEffect, useMemo } from "react";
import { readAllPagesInBackground } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { SelectionState } from "@editor/tools/pdfTextEditor/types";
import {
  accessibilityProgress,
  nextTodo,
  previousTodo,
  type AccessibilityProgress,
  type ReviewItem,
} from "@editor/tools/pdfTextEditor/util/accessibilityProgress";
import { revealOnPage } from "@editor/tools/pdfTextEditor/util/dom";
import {
  reviewCard,
  reviewItemElement,
  scrollItemToCard,
  holdCardWhileStepping,
} from "@editor/tools/pdfTextEditor/util/reviewCardScroll";

export interface ReviewProgress extends AccessibilityProgress {
  /** The selected item, when exactly one text block or image is selected. */
  current: ReviewItem | null;
  /** The next item still to do after the selection, or null when none is left. */
  next: ReviewItem | null;
  /** The item still to do before the selection, or null when none is left. */
  previous: ReviewItem | null;
  /** 1-based place of the selection among the items still to do; null when it is not one of them. */
  todoPosition: number | null;
  /** How many items are still to do. */
  todoCount: number;
  /** Selects `item` and scrolls it into view. */
  select: (item: ReviewItem) => void;
}

const EMPTY: AccessibilityProgress = {
  items: [],
  done: 0,
  total: 0,
  complete: true,
};

/**
 * Tagging progress across every page: scoring only the pages the viewer has read
 * would jump as the user scrolls. Reads every page in the background while mounted.
 */
export function useAccessibilityProgress(
  store: EditorStore,
  state: EditorViewState,
  selection: SelectionState,
): ReviewProgress {
  const doc = store.document;
  useEffect(() => {
    if (!state.hasDocument) return;
    return readAllPagesInBackground(store);
  }, [state.hasDocument, store]);

  const progress = useMemo(
    () => (doc ? accessibilityProgress(doc, state.pages) : EMPTY),
    [doc, state.pages],
  );

  const currentId = selectedId(selection);
  const current = useMemo(
    () => progress.items.find((i) => i.id === currentId) ?? null,
    [progress.items, currentId],
  );
  const next = useMemo(
    () => nextTodo(progress.items, currentId),
    [progress.items, currentId],
  );
  const previous = useMemo(
    () => previousTodo(progress.items, currentId),
    [progress.items, currentId],
  );
  const todos = useMemo(
    () => progress.items.filter((i) => i.status === "todo"),
    [progress.items],
  );
  const at = todos.findIndex((i) => i.id === currentId);
  const select = useCallback(
    (item: ReviewItem) => selectReviewItem(store, item),
    [store],
  );
  return {
    ...progress,
    current,
    next,
    previous,
    todoPosition: at === -1 ? null : at + 1,
    todoCount: todos.length,
    select,
  };
}

/** Selects `item` and brings it on screen: level with the review card while it is open, else centred. */
export function selectReviewItem(store: EditorStore, item: ReviewItem): void {
  if (reviewCard.open) holdCardWhileStepping();
  if (item.kind === "text") store.selection.selectOne(item.id);
  else store.selection.selectImage(item.id);
  // The page may mount only after the reveal scrolls it near the screen.
  window.requestAnimationFrame(() =>
    reviewCard.open
      ? scrollItemToCard(item)
      : revealOnPage(reviewItemElement(item), item.pageIndex),
  );
}

function selectedId(selection: SelectionState): string | null {
  const count = selection.runIds.length + selection.imageIds.length;
  if (count !== 1) return null;
  return selection.runIds[0] ?? selection.imageIds[0] ?? null;
}
