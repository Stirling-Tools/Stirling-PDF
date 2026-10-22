import { useEffect, useId, useRef } from "react";

const HISTORY_KEY = "processingFolderPicker";

/**
 * Keeps browser and mouse Back inside the picker while it has visited folders.
 * `onBack` restores one visit and returns whether more visits remain.
 */
export function useFolderPickerBack(enabled: boolean, onBack: () => boolean) {
  const token = useId();
  const restore = useRef(onBack);
  restore.current = onBack;
  const back = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    const url = window.location.href;
    const state = window.history.state;
    let armed = true;
    let pending = false;
    const arm = () => {
      window.history.pushState({ ...state, [HISTORY_KEY]: token }, "", url);
      armed = true;
    };
    arm();

    const handlePop = (event: PopStateEvent) => {
      if (!armed || window.location.href !== url) return;
      // The editor's route listeners must not interpret a folder visit as leaving a tool.
      event.stopImmediatePropagation();
      armed = false;
      pending = false;
      if (restore.current()) arm();
    };
    const requestBack = () => {
      if (!armed || pending) return;
      pending = true;
      window.history.back();
    };
    const handleKey = (event: KeyboardEvent) => {
      const editing =
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
        );
      if (
        (event.key === "ArrowLeft" && event.altKey) ||
        (event.key === "Backspace" &&
          !editing &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey)
      ) {
        event.preventDefault();
        event.stopPropagation();
        requestBack();
      }
    };
    back.current = requestBack;
    window.addEventListener("popstate", handlePop, true);
    window.addEventListener("keydown", handleKey, true);
    return () => {
      back.current = () => {};
      window.removeEventListener("popstate", handlePop, true);
      window.removeEventListener("keydown", handleKey, true);
      if (armed && !pending && window.history.state?.[HISTORY_KEY] === token) {
        window.history.back();
      }
    };
  }, [enabled, token]);

  return () => back.current();
}
