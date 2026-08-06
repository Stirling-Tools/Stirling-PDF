import { useSaveShortcut } from "@editor/hooks/useSaveShortcut";
import { useExitWarning } from "@editor/hooks/useExitWarning";
import { useNewWindowShortcut } from "@editor/hooks/useNewWindowShortcut";
import { useOpenWindowFiles } from "@editor/hooks/useOpenWindowFiles";

/**
 * Desktop-only component that sets up keyboard shortcuts and exit warnings
 * - Ctrl/Cmd+S to save selected files
 * - Ctrl/Cmd+N to open an empty new window
 * - Loads files queued for this window ("Open in new window" from My Files)
 * - Warning on app exit if unsaved files
 * Renders nothing, just sets up the listeners
 */
export function SaveShortcutListener() {
  useSaveShortcut();
  useNewWindowShortcut();
  useOpenWindowFiles();
  useExitWarning();
  return null;
}
