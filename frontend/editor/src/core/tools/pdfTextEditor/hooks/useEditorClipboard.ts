import { useEffect, useRef } from "react";
import { isFocusInContentEditable } from "@app/tools/pdfTextEditor/util/dom";

export interface EditorClipboardCallbacks {
  /** True when any run or image is selected (images cut without carrying text). */
  hasSelection: () => boolean;
  /** Text of the selected runs, or null when the selection carries none. */
  getSelectedText: () => string | null;
  deleteSelection: () => void;
  insertPastedText: (text: string, stripFormatting: boolean) => void;
}

const SINK_ID = "pdf-editor-clipboard-sink";

/** The off-screen textarea, created on first use. */
function ensureSink(): HTMLTextAreaElement {
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
  return sink;
}

function getSink(): HTMLTextAreaElement | null {
  return document.getElementById(SINK_ID) as HTMLTextAreaElement | null;
}

/** Object-level cut/copy/paste for the editor. */
export function useEditorClipboard(cbs: EditorClipboardCallbacks) {
  const ref = useRef(cbs);
  ref.current = cbs;

  useEffect(() => {
    // ClipboardEvent carries no modifier state, so Ctrl+Shift+V is remembered
    // from the keystroke that triggered it.
    let pastePlain = false;
    // Set by the native `cut` of the sink - i.e. proof the browser actually
    // took the text to the system clipboard.
    let sinkCutObserved = false;
    // Deferred cleanup for the in-flight clipboard keystroke.
    let pendingRelease: (() => void) | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    /** Finish the previous clipboard keystroke NOW. */
    function flushPending(): void {
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      pendingTimer = null;
      const run = pendingRelease;
      pendingRelease = null;
      run?.();
    }

    // Runs after the keystroke's default action, so the browser's own
    // cut/copy/paste of the sink has already happened.
    function scheduleRelease(fn: () => void): void {
      pendingRelease = fn;
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        pendingRelease = null;
        fn();
      }, 0);
    }

    /** Empty the sink and hand focus back to whatever had it. */
    function releaseSink(restoreTo: HTMLElement | null): void {
      const sink = getSink();
      if (!sink) return;
      sink.value = "";
      if (document.activeElement !== sink) return;
      // blur() first: focus() on <body> is a no-op, so without this the sink
      // keeps focus and the next keystroke is treated as an in-run edit.
      sink.blur();
      if (restoreTo && restoreTo !== document.body) {
        restoreTo.focus?.({ preventScroll: true });
      }
    }

    function onCut(e: ClipboardEvent): void {
      if (e.target === getSink()) sinkCutObserved = true;
    }

    function onPaste(e: ClipboardEvent) {
      // Consume the modifier state captured by the keystroke that opened this
      // paste, whoever ends up handling it.
      const stripFormatting = pastePlain;
      pastePlain = false;
      const sink = getSink();
      // Our own sink IS an editable element, so the guard below would eat the
      // very paste we set it up to receive.
      const intoSink =
        sink !== null && (e.target === sink || document.activeElement === sink);
      // A caret inside a run (or in Find/Replace/password) keeps native paste.
      if (!intoSink && isFocusInContentEditable()) return;
      const text = e.clipboardData?.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      ref.current.insertPastedText(text, stripFormatting);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === "v") {
        // Recorded before any bail, or Ctrl+Shift+V would leave the flag set
        // for whatever pastes next.
        pastePlain = e.shiftKey;
        // A caret inside a run (or in Find/Replace/password) pastes natively
        // into that field - don't pull focus out from under it.
        if (isFocusInContentEditable()) return;
        flushPending();
        const restoreTo = document.activeElement as HTMLElement | null;
        const sink = ensureSink();
        sink.value = "";
        // Synchronous, and deliberately NOT preventDefault: the keystroke's own
        // default action is the paste.
        sink.focus({ preventScroll: true });
        scheduleRelease(() => {
          // No paste arrived (empty clipboard, image-only, engine declined):
          // drop the modifier state so it can't leak into the next paste.
          pastePlain = false;
          releaseSink(restoreTo);
        });
        return;
      }
      if (key !== "c" && key !== "x") return;
      // A caret inside a run (or in Find/Replace/password) keeps native
      // copy/cut over its own text.
      if (isFocusInContentEditable()) return;
      if (!ref.current.hasSelection()) return;
      flushPending();
      const text = ref.current.getSelectedText();
      const restoreTo = document.activeElement as HTMLElement | null;
      sinkCutObserved = false;
      // Deliberately NOT preventDefault: the browser's own copy/cut of the
      // sink's selection is what reaches the system clipboard.
      if (text !== null) {
        const sink = ensureSink();
        sink.value = text;
        sink.focus({ preventScroll: true });
        sink.select();
      }
      scheduleRelease(() => {
        // Read the evidence before releaseSink() wipes the sink.
        const clipboardWritten = sinkCutObserved;
        releaseSink(restoreTo);
        window.getSelection()?.removeAllRanges();
        // Only destroy the selection once the text is safely on the clipboard.
        if (key === "x" && (text === null || clipboardWritten)) {
          ref.current.deleteSelection();
        }
      });
    }

    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      // Drop the pending release rather than flushing it: a cut's
      // deleteSelection() must not fire into a tree that is unmounting.
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      pendingTimer = null;
      pendingRelease = null;
      window.removeEventListener("cut", onCut);
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKeyDown);
      document.getElementById(SINK_ID)?.remove();
    };
  }, []);
}
