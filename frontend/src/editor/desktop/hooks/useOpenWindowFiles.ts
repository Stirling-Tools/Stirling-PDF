import { useEffect, useRef } from "react";
import { fileOpenService } from "@app/services/fileOpenService";
import { fileStorage } from "@app/services/fileStorage";
import { materializeServerStubs } from "@app/services/fileSyncService";
import { useFileActions } from "@app/contexts/file/fileHooks";
import { StirlingFileStub } from "@app/types/fileContext";
import { FileId } from "@app/types/file";

/**
 * Desktop-only: when a window is spawned via "Open in new window" from the My
 * Files page, the file ids are queued in the Rust backend under this window's
 * label. On mount we pop them and load the matching stored files from the
 * shared IndexedDB store into this window's workspace.
 *
 * Mirrors the files-page "add to workspace" path (FileManagerView): stored
 * stubs may be server-only (no local bytes), so they go through
 * materializeServerStubs before being added.
 */
export function useOpenWindowFiles() {
  const { actions } = useFileActions();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;

    const loadPendingFiles = async () => {
      const fileIds = await fileOpenService.popWindowFileIds();
      if (fileIds.length === 0) return;
      consumedRef.current = true;

      const stubs = (
        await Promise.all(
          fileIds.map((id) => fileStorage.getStirlingFileStub(id as FileId)),
        )
      ).filter((s): s is StirlingFileStub => Boolean(s));

      if (stubs.length === 0) {
        console.warn(
          "[Desktop] open-in-new-window: no stored files found for ids",
          fileIds,
        );
        return;
      }

      // Download + ingest any server-only stubs first; local stubs pass through.
      const materialized = await materializeServerStubs(stubs, {
        addFiles: actions.addFilesWithOptions,
        updateStub: actions.updateStirlingFileStub,
      });

      if (materialized.length > 0) {
        await actions.addStirlingFileStubs(materialized, { selectFiles: true });
        console.log(
          `[Desktop] Opened ${materialized.length} stored file(s) in new window`,
        );
      }
    };

    loadPendingFiles().catch((error) => {
      console.error("[Desktop] Failed to load files for new window:", error);
    });
  }, [actions]);
}
