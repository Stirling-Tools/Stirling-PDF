import { useSaveShortcut } from '@app/hooks/useSaveShortcut';
import { useExitWarning } from '@app/hooks/useExitWarning';

/**
 * Desktop-only component that sets up keyboard shortcuts and exit warnings
 * - Ctrl/Cmd+S to save selected files
 * - Warning on app exit if unsaved files
 * Renders nothing, just sets up the listeners
 */
export function SaveShortcutListener() {
  useSaveShortcut();
  useExitWarning();
  return null;
}
