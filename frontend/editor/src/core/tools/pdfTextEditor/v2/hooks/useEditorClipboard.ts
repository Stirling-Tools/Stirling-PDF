import { useEffect, useRef } from "react";
import { isFocusInContentEditable } from "@app/tools/pdfTextEditor/v2/util/dom";

export interface EditorClipboardCallbacks {
  /** True when any run or image is selected (images cut without carrying text). */
  hasSelection: () => boolean;
  /** Text of the selected runs, or null when the selection carries none. */
  getSelectedText: () => string | null;
  deleteSelection: () => void;
  insertPastedText: (text: string, stripFormatting: boolean) => void;
}

const SINK_ID = "v2-clipboard-sink";

/**
 * Off-screen textarea used to hand the selection's text to the browser's
 * OWN copy/cut, which is the only clipboard write that works everywhere.
 */
function fillSink(text: string): HTMLTextAreaElement {
  let sink = document.getElementById(SINK_ID) as HTMLTextAreaElement | null;
  if (!sink) {
    sink = document.createElement("textarea");
    sink.id = SINK_ID;
    sink.tabIndex = -1;
    sink.setAttribute("aria-hidden", "true");
    sink.style.cssText =
      "position:fixed;top:0;left:-9999px;width:1px;height:1px;padding:0;border:0;opacity:0;";
    document.body.appendChild(sink);
  }
  sink.value = text;
  sink.focus({ preventScroll: true });
  sink.select();
  return sink;
}

/**
 * Object-level cut/copy/paste for the editor (whole runs and images, as
 * opposed to a caret sitting inside one run - that stays with the browser
 * and TextRunOverlay's own onPaste).
 *
 * Neither half goes through navigator.clipboard. Its read side is refused
 * outright by WebKit even under a user gesture, is prompt-gated in Firefox,
 * needs an explicit permission in Chromium, and the whole object is
 * undefined on a non-secure origin - i.e. every plain-HTTP self-host - so
 * Ctrl+V was a silent no-op nearly everywhere.
 *
 * Write: park the selected text in an off-screen textarea, select it, and
 * let the browser's native copy/cut take it. Measured: WebKit ignores a
 * script-authored `clipboardData.setData()` entirely (the clipboard ends up
 * empty), but honours a real DOM selection. Chromium and Firefox honour
 * both, so the selection route is the one that works on all three.
 *
 * Read: the native paste ClipboardEvent, whose `clipboardData` is populated
 * on every engine, secure context or not.
 */
export function useEditorClipboard(cbs: EditorClipboardCallbacks) {
  const ref = useRef(cbs);
  ref.current = cbs;

  useEffect(() => {
    // ClipboardEvent carries no modifier state, so Ctrl+Shift+V is remembered
    // from the keystroke that triggered it.
    let pastePlain = false;

    function onPaste(e: ClipboardEvent) {
      if (isFocusInContentEditable()) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      ref.current.insertPastedText(text, pastePlain);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "v") {
        pastePlain = e.shiftKey;
        return;
      }
      if (key !== "c" && key !== "x") return;
      // A caret inside a run (or in Find/Replace/password) keeps native
      // copy/cut over its own text.
      if (isFocusInContentEditable()) return;
      if (!ref.current.hasSelection()) return;
      const text = ref.current.getSelectedText();
      const restoreTo = document.activeElement as HTMLElement | null;
      // Deliberately NOT preventDefault: the browser's own copy/cut of the
      // sink's selection is what reaches the system clipboard.
      if (text !== null) fillSink(text);
      // Runs after the keystroke's default action, so the clipboard write
      // has already happened.
      setTimeout(() => {
        const sink = document.getElementById(
          SINK_ID,
        ) as HTMLTextAreaElement | null;
        if (sink && document.activeElement === sink) {
          sink.value = "";
          // blur() first: focus() on <body> is a no-op, so without this the
          // sink keeps focus and the next paste is treated as an in-run edit.
          sink.blur();
          if (restoreTo && restoreTo !== document.body)
            restoreTo.focus?.({ preventScroll: true });
        }
        window.getSelection()?.removeAllRanges();
        if (key === "x") ref.current.deleteSelection();
      }, 0);
    }

    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown);
      document.getElementById(SINK_ID)?.remove();
    };
  }, []);
}
