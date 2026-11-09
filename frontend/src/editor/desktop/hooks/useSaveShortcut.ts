import { useCallback, useEffect, useRef, useState } from "react";
import { useFileSelectors } from "@editor/contexts/FileContext";
import { useNavigationState } from "@editor/contexts/NavigationContext";
import { useViewer } from "@editor/contexts/viewer/viewerContext";
import { useSaveStoredFile } from "@editor/hooks/useSaveStoredFile";

/**
 * Desktop-only keyboard shortcut: Ctrl/Cmd+S saves the selected files, or all
 * files, where the toolbar's Save would (disk, or a save target).
 */
export function useSaveShortcut() {
  const selectors = useFileSelectors();
  const { workbench } = useNavigationState();
  const { applyChanges } = useViewer();
  const { saveStoredFile } = useSaveStoredFile();
  const [saveRequest, setSaveRequest] = useState(0);
  const handledRequest = useRef(0);

  const saveFiles = useCallback(async () => {
    const selected = selectors.getSelectedStirlingFileStubs();
    const stubs =
      selected.length > 0 ? selected : selectors.getStirlingFileStubs();
    for (const stub of stubs) {
      const outcome = await saveStoredFile(stub, selectors.getFile(stub.id));
      if (outcome === "cancelled") break;
    }
  }, [selectors, saveStoredFile]);

  useEffect(() => {
    if (saveRequest === handledRequest.current) return;
    handledRequest.current = saveRequest;
    void saveFiles();
  }, [saveRequest, saveFiles]);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "s") return;
      event.preventDefault();

      if (workbench === "viewer") {
        try {
          await applyChanges?.();
        } catch {
          return;
        }
      }
      setSaveRequest((request) => request + 1);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [workbench, applyChanges]);
}
