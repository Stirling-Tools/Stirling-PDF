import { useEffect, useRef } from "react";
import { useHotkeys } from "@app/contexts/HotkeyContext";
import { useFileState, useFileActions } from "@app/contexts/file/fileHooks";
import { useViewer } from "@app/contexts/ViewerContext";

/**
 * Registers handlers for non-tool hotkey actions (file cycling, etc.).
 * Mounted inside ViewerProvider so it can switch the displayed document via
 * useViewer().setActiveFileId in addition to updating selection state.
 * Handlers register once and read the latest state via refs so they don't
 * churn the registry on every selection change.
 */
export function HotkeyActionRegistrar() {
  const { registerActionHandler } = useHotkeys();
  const { state } = useFileState();
  const { actions } = useFileActions();
  const { activeFileId, setActiveFileId, setActiveFileIndex } = useViewer();

  const stateRef = useRef(state);
  stateRef.current = state;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const activeFileIdRef = useRef(activeFileId);
  activeFileIdRef.current = activeFileId;
  const setActiveFileIdRef = useRef(setActiveFileId);
  setActiveFileIdRef.current = setActiveFileId;
  const setActiveFileIndexRef = useRef(setActiveFileIndex);
  setActiveFileIndexRef.current = setActiveFileIndex;

  useEffect(() => {
    const cycle = (direction: 1 | -1) => {
      const ids = stateRef.current.files.ids;
      if (ids.length < 2) return;

      // Prefer the viewer's active file as the cursor; fall back to the first
      // selected file, then to the start/end of the list.
      const current =
        activeFileIdRef.current ?? stateRef.current.ui.selectedFileIds[0];
      const currentIndex = current ? ids.findIndex((id) => id === current) : -1;
      const base =
        currentIndex === -1 ? (direction === 1 ? -1 : 0) : currentIndex;
      const nextIndex = (base + direction + ids.length) % ids.length;
      const nextId = ids[nextIndex];
      if (!nextId) return;

      setActiveFileIdRef.current(nextId);
      setActiveFileIndexRef.current(nextIndex);
      actionsRef.current.setSelectedFiles([nextId]);
    };

    const unregisterNext = registerActionHandler("file.cycleNext", () =>
      cycle(1),
    );
    const unregisterPrev = registerActionHandler("file.cyclePrev", () =>
      cycle(-1),
    );

    return () => {
      unregisterNext();
      unregisterPrev();
    };
  }, [registerActionHandler]);

  return null;
}
