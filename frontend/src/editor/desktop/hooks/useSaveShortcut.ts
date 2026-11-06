import { useEffect } from "react";
import {
  useFileSelector,
  useFileSelectors,
} from "@editor/contexts/FileContext";
import { useSaveStoredFile } from "@editor/hooks/useSaveStoredFile";

/**
 * Desktop-only keyboard shortcut: Ctrl/Cmd+S saves the selected files, or all
 * files, where the toolbar's Save would (disk, or a save target).
 */
export function useSaveShortcut() {
  const selectors = useFileSelectors();
  const currentSelectedFileIds = useFileSelector((s) => s.ui.selectedFileIds);
  const { saveStoredFile } = useSaveStoredFile();

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "s") return;
      event.preventDefault();

      const ids =
        currentSelectedFileIds.length > 0 ? currentSelectedFileIds : undefined;
      for (const stub of selectors.getStirlingFileStubs(ids)) {
        const file = selectors.getFile(stub.id);
        if (!file) continue;
        if ((await saveStoredFile(stub, file)) === "cancelled") break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectors, currentSelectedFileIds, saveStoredFile]);
}
