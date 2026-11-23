import { useEffect } from "react";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  isFocusInContentEditable,
  isFocusInFormField,
  isModalOpen,
  visiblePageNumber,
} from "@editor/tools/pdfTextEditor/util/dom";
import { currentEditorSession } from "@editor/tools/pdfTextEditor/store/EditorSession";

interface KeyboardShortcutCallbacks {
  store: EditorStore;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
  onToggleHelp: () => void;
  onOpenFind: () => void;
  onFindNext: (reverse: boolean) => void;
  onEscape: () => void;
  onMergeSelection: () => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
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
    onToggleHelp,
    onOpenFind,
    onFindNext,
    onEscape,
    onMergeSelection,
    onToggleBold,
    onToggleItalic,
  } = cbs;

  useEffect(() => {
    function onMetaKey(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      // Normalise: with Shift or CapsLock the letter arrives UPPERCASE.
      const key = e.key.toLowerCase();
      if (key !== "s" && isModalOpen()) return;
      switch (key) {
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
          // focused.
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
        // c / x / v are deliberately NOT handled here.
        case "f":
          e.preventDefault();
          onOpenFind();
          return;
        case "g":
          e.preventDefault();
          onFindNext(e.shiftKey);
          return;
        case "b":
        case "i":
          if (isFocusInFormField()) return;
          if (store.selection.value.runIds.length === 0) return;
          e.preventDefault();
          if (key === "b") onToggleBold();
          else onToggleItalic();
          return;
        case "m":
          if (store.selection.value.runIds.length < 2) return;
          e.preventDefault();
          if (isFocusInContentEditable())
            (document.activeElement as HTMLElement | null)?.blur();
          onMergeSelection();
          return;
        default:
          return;
      }
    }

    function onPlainKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // "?" is a character that types into text; F1 types nothing, so it opens the help from anywhere.
      if (e.key === "F1" || (e.key === "?" && !isFocusInContentEditable())) {
        e.preventDefault();
        onToggleHelp();
        return;
      }
      if (isModalOpen()) return;
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
      // Mac keyboards have no Delete key; their ⌫ arrives as Backspace.
      if (e.key === "Delete" || e.key === "Backspace") {
        if (isFocusInContentEditable()) return;
        const sel = store.selection.value;
        if (
          sel.runIds.length === 0 &&
          sel.imageIds.length === 0 &&
          sel.shapeIds.length === 0
        )
          return;
        e.preventDefault();
        onDelete();
        return;
      }
    }

    function onPageNav(e: KeyboardEvent) {
      if (isFocusInContentEditable() || isModalOpen()) return;
      const isHome = e.key === "Home" && (e.ctrlKey || e.metaKey);
      const isEnd = e.key === "End" && (e.ctrlKey || e.metaKey);
      if (e.key !== "PageDown" && e.key !== "PageUp" && !isHome && !isEnd) {
        return;
      }
      const { pageCount } = store.getState();
      if (pageCount === 0) return;
      // The viewer mounts only the pages near the viewport, so it does the
      // navigating.
      const session = currentEditorSession();
      if (!session) return;
      const current = visiblePageNumber();
      let target = current;
      if (e.key === "PageDown") target = Math.min(pageCount - 1, current + 1);
      else if (e.key === "PageUp") target = Math.max(0, current - 1);
      else if (isHome) target = 0;
      else if (isEnd) target = pageCount - 1;
      if (target === current) return;
      e.preventDefault();
      session.revealPage(target);
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
    onToggleHelp,
    onOpenFind,
    onFindNext,
    onEscape,
    onMergeSelection,
    onToggleBold,
    onToggleItalic,
  ]);
}
