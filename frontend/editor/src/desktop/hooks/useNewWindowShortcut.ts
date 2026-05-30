import { useEffect } from "react";
import { fileOpenService } from "@app/services/fileOpenService";
import { useMultiWindowSupported } from "@app/hooks/useMultiWindowSupported";

/**
 * Desktop-only keyboard shortcut: Ctrl+N (Cmd+N on macOS) opens an empty new
 * window. The new window runs in the same Tauri process and shares the bundled
 * backend. Disabled on platforms where multi-window isn't supported (Linux) so
 * the new window doesn't start blank - see useMultiWindowSupported.
 *
 * Safe to bind plain Ctrl/Cmd+N here: the listener is only registered inside the
 * Tauri desktop app (useMultiWindowSupported is false on web), so the browser's
 * native Ctrl+N is never intercepted in the web build.
 */
export function useNewWindowShortcut() {
  const supported = useMultiWindowSupported();

  useEffect(() => {
    if (!supported) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (
        modifier &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "n"
      ) {
        event.preventDefault();
        fileOpenService.openInNewWindow([]);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [supported]);
}
