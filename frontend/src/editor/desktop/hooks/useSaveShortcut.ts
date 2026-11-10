import { useEffect } from "react";
import { useWorkbenchSave } from "@editor/hooks/useWorkbenchSave";
import { stripBasePath } from "@editor/constants/app";
import { isPortalPath } from "@editor/routes/portalBasename";

/** Desktop-only keyboard shortcut: Ctrl/Cmd+S runs the toolbar's Save. Quiet on Processor pages, where the editor's files are out of sight. */
export function useSaveShortcut() {
  const { save } = useWorkbenchSave();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "s") return;
      if (isPortalPath(stripBasePath(window.location.pathname))) return;
      event.preventDefault();
      void save();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [save]);
}
