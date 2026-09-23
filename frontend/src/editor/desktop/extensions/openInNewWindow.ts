import { StirlingFileStub } from "@app/types/fileContext";
import { fileOpenService } from "@app/services/fileOpenService";
import { useMultiWindowSupported } from "@app/hooks/useMultiWindowSupported";
import type { OpenInNewWindowApi } from "@core/extensions/openInNewWindow";

/**
 * Desktop build: open a stored file in a new Tauri window. The new window loads
 * the file by id from the shared IndexedDB store (see useOpenWindowFiles), which
 * only works where windows share one persistent web store - so this is gated on
 * useMultiWindowSupported (disabled on Linux).
 */
export function useOpenInNewWindow(): OpenInNewWindowApi {
  const supported = useMultiWindowSupported();

  return {
    canOpenInNewWindow: (file: StirlingFileStub) =>
      supported && Boolean(file.id),
    openInNewWindow: (file: StirlingFileStub) => {
      if (file.id) {
        fileOpenService.openFilesInNewWindow([file.id]);
      }
    },
  };
}
