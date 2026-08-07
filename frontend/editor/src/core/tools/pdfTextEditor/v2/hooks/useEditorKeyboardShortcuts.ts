import { useEffect } from "react";
import type { EditorStore } from "@app/tools/pdfTextEditor/v2/store/EditorStore";
import {
  findVisiblePageIndex,
  isFocusInContentEditable,
  isFocusInFormField,
  pageElements,
} from "@app/tools/pdfTextEditor/v2/util/dom";

interface KeyboardShortcutCallbacks {
  store: EditorStore;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
  onCopySelected: () => void;
  onCutSelected: () => void;
  onPaste: (stripFormatting: boolean) => void;
  onToggleHelp: () => void;
  onOpenFind: () => void;
  onFindNext: (reverse: boolean) => void;
  onEscape: () => void;
  onMergeSelection: () => void;
}

/** Bind every editor-level keyboard shortcut to `window` for the session. */
export function useEditorKeyboardShortcuts(cbs: KeyboardShortcutCallbacks) {
  const {
    store,
    onUndo,
    onRedo,
    onSave,
    onDelete,
    onDuplicate,
    onSelectAll,
    onCopySelected,
    onCutSelected,
    onPaste,
    onToggleHelp,
    onOpenFind,
    onFindNext,
    onEscape,
    onMergeSelection,
  } = cbs;

  useEffect(() => {
    function onMetaKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      // Normalise: with Shift or CapsLock the letter arrives UPPERCASE, so
      // matching e.key verbatim made every Shift-modified shortcut
      // (Ctrl+Shift+Z redo, Ctrl+Shift+V paste-plain, Ctrl+Shift+G) dead
      // and CapsLock leaked Ctrl+S to the browser's save-page dialog.
      switch (e.key.toLowerCase()) {
        case "z":
          // Form fields (Find/Replace/password) keep their NATIVE undo.
          if (isFocusInFormField()) return;
          // Blur an active editable before history so the overlay sync
          // effect can rewrite the DOM from the reverted model.
          if (isFocusInContentEditable())
            (document.activeElement as HTMLElement | null)?.blur();
          if (e.shiftKey) {
            e.preventDefault();
            onRedo();
          } else {
            e.preventDefault();
            onUndo();
          }
          return;
        case "y":
          if (isFocusInFormField()) return;
          if (isFocusInContentEditable())
            (document.activeElement as HTMLElement | null)?.blur();
          e.preventDefault();
          onRedo();
          return;
        case "s":
          e.preventDefault();
          // Commit the in-progress edit first: blur bakes the pending
          // text + wrap reflow, otherwise the download misses them.
          if (isFocusInContentEditable())
            (document.activeElement as HTMLElement | null)?.blur();
          onSave();
          return;
        case "d":
          // No focus guard: duplicate must work while a run's editable is
          // focused. Always claim the key - leaking it opens the browser
          // bookmark dialog mid-session.
          e.preventDefault();
          if (store.selection.value.runIds.length === 0) return;
          onDuplicate();
          return;
        case "a":
          // Guard covers contenteditable AND Find/password inputs (dom.ts).
          if (isFocusInContentEditable()) return;
          e.preventDefault();
          onSelectAll();
          return;
        case "c":
          if (isFocusInContentEditable()) return;
          onCopySelected();
          return;
        case "x":
          if (isFocusInContentEditable()) return;
          if (
            store.selection.value.runIds.length === 0 &&
            store.selection.value.imageIds.length === 0
          )
            return;
          e.preventDefault();
          onCutSelected();
          return;
        case "v":
          if (isFocusInContentEditable()) return;
          e.preventDefault();
          onPaste(e.shiftKey);
          return;
        case "f":
          e.preventDefault();
          onOpenFind();
          return;
        case "g":
          e.preventDefault();
          onFindNext(e.shiftKey);
          return;
        case "m":
          if (store.selection.value.runIds.length < 2) return;
          e.preventDefault();
          onMergeSelection();
          return;
        default:
          return;
      }
    }

    function onPlainKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?" || e.key === "F1") {
        if (isFocusInContentEditable()) return;
        e.preventDefault();
        onToggleHelp();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        onFindNext(e.shiftKey);
        return;
      }
      if (e.key === "Escape") {
        if (isFocusInContentEditable()) return;
        e.preventDefault();
        onEscape();
        return;
      }
      if (e.key === "Delete") {
        if (isFocusInContentEditable()) return;
        const sel = store.selection.value;
        if (sel.runIds.length === 0 && sel.imageIds.length === 0) return;
        e.preventDefault();
        onDelete();
        return;
      }
    }

    function onPageNav(e: KeyboardEvent) {
      if (isFocusInContentEditable()) return;
      const isHome = e.key === "Home" && (e.ctrlKey || e.metaKey);
      const isEnd = e.key === "End" && (e.ctrlKey || e.metaKey);
      if (e.key !== "PageDown" && e.key !== "PageUp" && !isHome && !isEnd) {
        return;
      }
      if (store.getState().pageCount === 0) return;
      const pages = pageElements();
      if (pages.length === 0) return;
      const current = findVisiblePageIndex();
      let target = current;
      if (e.key === "PageDown")
        target = Math.min(pages.length - 1, current + 1);
      else if (e.key === "PageUp") target = Math.max(0, current - 1);
      else if (isHome) target = 0;
      else if (isEnd) target = pages.length - 1;
      if (target === current) return;
      e.preventDefault();
      pages[target]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    window.addEventListener("keydown", onMetaKey);
    window.addEventListener("keydown", onPlainKey);
    window.addEventListener("keydown", onPageNav);
    return () => {
      window.removeEventListener("keydown", onMetaKey);
      window.removeEventListener("keydown", onPlainKey);
      window.removeEventListener("keydown", onPageNav);
    };
  }, [
    store,
    onUndo,
    onRedo,
    onSave,
    onDelete,
    onDuplicate,
    onSelectAll,
    onCopySelected,
    onCutSelected,
    onPaste,
    onToggleHelp,
    onOpenFind,
    onFindNext,
    onEscape,
    onMergeSelection,
  ]);
}
