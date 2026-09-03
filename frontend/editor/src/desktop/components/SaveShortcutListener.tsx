import { useSaveShortcut } from "@app/hooks/useSaveShortcut";
import { useExitWarning } from "@app/hooks/useExitWarning";
import { useNewWindowShortcut } from "@app/hooks/useNewWindowShortcut";
import { useOpenWindowFiles } from "@app/hooks/useOpenWindowFiles";
import { useDiskWatcher } from "@app/hooks/useDiskWatcher";

/**
 * Desktop-only component that sets up keyboard shortcuts and exit warnings
 * - Ctrl/Cmd+S to save selected files
 * - Ctrl/Cmd+N to open an empty new window
 * - Loads files queued for this window ("Open in new window" from My Files)
 * - Warning on app exit if unsaved files
 * - Watches open files' disk originals for external edits and deletions
 * Renders nothing, just sets up the listeners
 */
export function SaveShortcutListener() {
  useSaveShortcut();
  useNewWindowShortcut();
  useOpenWindowFiles();
  useExitWarning();
  useDiskWatcher();
  return null;
}
