import { useSyncExternalStore } from "react";

/** A point on a page, in PDF points from its lower-left corner. */
export interface PagePoint {
  pageIndex: number;
  x: number;
  y: number;
}

export type LockTarget = { runId: string } | { imageId: string };

/** The cell of an editable table a right-click landed in. */
export interface TableHit {
  pageIndex: number;
  tableId: string;
  row: number;
  col: number;
}

/** The parts of a right-click the editor reads; a DOM or React mouse event. */
export type ContextMenuEvent = Pick<
  MouseEvent,
  "target" | "clientX" | "clientY" | "preventDefault"
>;

/** What a right-click (or the menu key) asked the editor's menu to show. */
export type ContextMenuRequest =
  | {
      kind: "objects";
      clientX: number;
      clientY: number;
      at: PagePoint | null;
      table?: TableHit;
    }
  | {
      kind: "page";
      clientX: number;
      clientY: number;
      at: PagePoint;
      table?: TableHit;
    }
  | {
      kind: "locked";
      clientX: number;
      clientY: number;
      pageIndex: number;
      target: LockTarget;
    };

let request: ContextMenuRequest | null = null;
let hosts = 0;
let focusedAtPress: Element | null = null;

// A right press focuses the text box under it before `contextmenu` fires, so
// whether the user was already typing there is read from before the press.
function recordFocus(e: PointerEvent): void {
  if (e.button === 2) focusedAtPress = document.activeElement;
}
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * The editor's right-click menu. Module state because the page views that
 * hear the right-click and the menu that answers it mount in separate trees.
 * Only a mounted menu claims right-clicks; without one the browser's own
 * menu shows, as on phones and during a review.
 */
export const editorContextMenu = {
  open(next: ContextMenuRequest): void {
    request = next;
    notify();
  },
  close(): void {
    if (!request) return;
    request = null;
    notify();
  },
  /** Registers a mounted menu; returns its unregister. */
  attachHost(): () => void {
    hosts += 1;
    if (hosts === 1) window.addEventListener("pointerdown", recordFocus, true);
    return () => {
      hosts -= 1;
      if (hosts === 0) {
        window.removeEventListener("pointerdown", recordFocus, true);
        editorContextMenu.close();
      }
    };
  },
  hasHost: (): boolean => hosts > 0,
  /** What had focus just before the latest right press. */
  focusedAtPress: (): Element | null => focusedAtPress,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useEditorContextMenu(): ContextMenuRequest | null {
  return useSyncExternalStore(editorContextMenu.subscribe, () => request);
}
