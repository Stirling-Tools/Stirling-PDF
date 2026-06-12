import { useEffect, useState, useCallback } from "react";
import { useFileState } from "@app/contexts/file/fileHooks";
import { useViewer } from "@app/contexts/ViewerContext";
import { isMacLike } from "@app/utils/hotkeys";

// Announcer state for aria-live
export interface TabShortcutsState {
  announcement: string;
}

export function useWorkspaceTabShortcuts(): TabShortcutsState {
  const { selectors } = useFileState();
  const { activeFileIndex, setActiveFileIndex } = useViewer();
  const [announcement, setAnnouncement] = useState("");
  const activeFiles = selectors.getFiles();

  const handleTabSwitch = useCallback(
    (direction: 1 | -1) => {
      if (activeFiles.length <= 1) return;

      const newIndex =
        (activeFileIndex + direction + activeFiles.length) % activeFiles.length;
      
      setActiveFileIndex(newIndex);
      
      const file = activeFiles[newIndex];
      setAnnouncement(`Switched to ${file.name}, tab ${newIndex + 1} of ${activeFiles.length}`);

      // Briefly highlight and scroll into view
      setTimeout(() => {
        const tabId = `file-tab-${file.fileId}`;
        const tabEl = document.getElementById(tabId);
        if (tabEl) {
          tabEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          tabEl.classList.add("keyboard-focus");
          setTimeout(() => tabEl.classList.remove("keyboard-focus"), 600);
        }
      }, 50);
    },
    [activeFiles, activeFileIndex, setActiveFileIndex]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.getAttribute("role") === "textbox"
      ) {
        return;
      }

      const isMac = isMacLike();
      const isTauri = typeof window !== "undefined" && !!(window as any).__TAURI__;

      let nextTab = false;
      let prevTab = false;

      if (isTauri) {
        if (e.key === "Tab" && e.ctrlKey && !e.shiftKey) {
          nextTab = true;
        } else if (e.key === "Tab" && e.ctrlKey && e.shiftKey) {
          prevTab = true;
        }
      }

      if (isMac) {
        if (e.key === "ArrowRight" && e.metaKey && e.altKey) {
          nextTab = true;
        } else if (e.key === "ArrowLeft" && e.metaKey && e.altKey) {
          prevTab = true;
        }
      }

      // Web defaults (and fallback for Desktop if they want it)
      if (e.key === "PageDown" && e.altKey) {
        nextTab = true;
      } else if (e.key === "PageUp" && e.altKey) {
        prevTab = true;
      }

      if (nextTab) {
        e.preventDefault();
        e.stopPropagation();
        handleTabSwitch(1);
      } else if (prevTab) {
        e.preventDefault();
        e.stopPropagation();
        handleTabSwitch(-1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleTabSwitch]);

  return { announcement };
}
