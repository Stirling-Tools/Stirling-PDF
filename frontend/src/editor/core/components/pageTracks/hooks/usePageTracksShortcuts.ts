import { useEffect, useRef } from "react";
import { TrackEditorAction } from "@app/components/pageTracks/trackWorkspaceReducer";

interface PageTracksShortcutsParams {
  selectedIds: ReadonlySet<string>;
  dispatch: (action: TrackEditorAction) => void;
}

/** Inputs that take no typing, such as a page tile's checkbox, keep the shortcuts. */
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit"]);

/** Typing in a field, or acting inside a dialog or menu over the editor, must not edit pages behind it. */
function isOutsideEditor(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(target.type);
  }
  return (
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable ||
    target.closest('[role="dialog"], [role="menu"]') != null
  );
}

export function usePageTracksShortcuts(params: PageTracksShortcutsParams) {
  // Read through a ref so the listener is installed once, not per selection change.
  const latest = useRef(params);
  latest.current = params;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isOutsideEditor(event.target)) return;
      const { selectedIds, dispatch } = latest.current;
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;

      if (command && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }
      if (command && key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      if (!command && (event.key === "Delete" || event.key === "Backspace")) {
        if (selectedIds.size === 0) return;
        event.preventDefault();
        dispatch({ type: "delete", pageIds: [...selectedIds] });
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
