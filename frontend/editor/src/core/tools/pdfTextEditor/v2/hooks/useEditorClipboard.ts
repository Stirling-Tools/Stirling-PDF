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
 * Both halves therefore route through an off-screen textarea ("the sink")
 * that is focused synchronously from the Ctrl+X/C/V keydown, letting the
 * browser's OWN cut/copy/paste do the privileged work:
 *
 * - Write: park the selected text in the sink and select it. Measured:
 *   WebKit ignores a script-authored `clipboardData.setData()` entirely
 *   (the clipboard ends up empty) but honours a real DOM selection.
 * - Read: the native paste ClipboardEvent, whose `clipboardData` is
 *   populated on every engine, secure context or not. The sink must be
 *   FOCUSED for it: WebKit only dispatches `paste` into an editable target,
 *   so with the editor's usual "nothing focused" selection state Ctrl+V
 *   produced no paste event at all and the key was dead. (Measured on Linux
 *   WebKit; Chromium and Firefox do fire it at `<body>`, which is the only
 *   reason the sink-less version appeared to work.)
 */
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

    /**
     * Finish the previous clipboard keystroke NOW. Ctrl+X immediately
     * followed by Ctrl+V would otherwise let the cut's deferred blur land in
     * the middle of the paste and steal the sink's focus.
     */
    function flushPending(): void {
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      pendingTimer = null;
      const run = pendingRelease;
      pendingRelease = null;
      run?.();
    }

    /**
     * Runs after the keystroke's default action, so the browser's own
     * cut/copy/paste of the sink has already happened. Verified on all three
     * engines: the `cut`/`paste` event is delivered BEFORE this timeout.
     *
     * Scheduled unconditionally (never from the paste handler) so a paste
     * that never arrives - empty clipboard, image-only clipboard, an engine
     * that declines - cannot leave the invisible sink holding focus. That
     * would read as a frozen editor: `isFocusInContentEditable()` is true for
     * a TEXTAREA, so every later shortcut would early-return and typed
     * characters would vanish off-screen.
     */
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
      // paste, whoever ends up handling it, so a later context-menu paste
      // can't inherit a stale Shift from an in-run Ctrl+Shift+V.
      const stripFormatting = pastePlain;
      pastePlain = false;
      const sink = getSink();
      // Our own sink IS an editable element, so the guard below would eat the
      // very paste we set it up to receive. Engines differ on whether the
      // event is retargeted to the focused element or dispatched at the
      // document, so accept either.
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
        // Synchronous, and deliberately NOT preventDefault: the keystroke's
        // own default action is the paste, and it needs the sink focused to
        // have somewhere to land.
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
        // Only destroy the selection once the text is safely on the
        // clipboard. An image-only selection carries no text (`text === null`
        // means the sink was never filled or selected, so no `cut` could
        // fire), and it has nothing to lose - it still deletes. Without this
        // split, a clipboard write the browser silently refused still wiped
        // the user's content with no way to paste it back.
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
