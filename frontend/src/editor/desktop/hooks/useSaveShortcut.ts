import { useCallback, useEffect } from "react";
import { useFileSelectors } from "@editor/contexts/FileContext";
import { useApplyEditsBeforeSave } from "@editor/hooks/useApplyEditsBeforeSave";
import { useSaveStoredFile } from "@editor/hooks/useSaveStoredFile";

/**
 * Desktop-only keyboard shortcut: Ctrl/Cmd+S saves the selected files, or all
 * files, where the toolbar's Save would (disk, or a save target).
 */
export function useSaveShortcut() {
  const selectors = useFileSelectors();
  const { saveStoredFile } = useSaveStoredFile();

  const saveFiles = useCallback(async () => {
    const selected = selectors.getSelectedStirlingFileStubs();
    const stubs =
      selected.length > 0 ? selected : selectors.getStirlingFileStubs();
    for (const stub of stubs) {
      const outcome = await saveStoredFile(stub, selectors.getFile(stub.id));
      if (outcome === "cancelled") break;
    }
  }, [selectors, saveStoredFile]);
  const save = useApplyEditsBeforeSave(saveFiles);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "s") return;
      event.preventDefault();
      void save();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [save]);
}
