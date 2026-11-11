import { useEffect } from "react";
import { useWorkbenchSave } from "@editor/hooks/useWorkbenchSave";

/** Desktop-only keyboard shortcut: Ctrl/Cmd+S runs the toolbar's Save. */
export function useSaveShortcut() {
  const { save } = useWorkbenchSave();

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
