/**
 * File lifecycle management - Resource cleanup and memory management
 */

import { FileId } from "@app/types/file";
import { releaseSharedDocumentWhenIdle } from "@app/services/pdfiumService";
import { releaseDocumentBytes } from "@app/services/documentBytesCache";
import {
  FileContextAction,
  FileContextState,
  StirlingFileStub,
  ProcessedFilePage,
  createStirlingFile,
} from "@app/types/fileContext";
import {
  forgetFile,
  noteFileSaved,
  persistedSourceFields,
} from "@app/contexts/file/storedFileReconciler";

const DEBUG = process.env.NODE_ENV === "development";

// Long tool sessions accumulate one stub per file and variant, each carrying
// full-page data-URL thumbnails (~1.5MB each, rotated + unrotated). The display
// chain refills a stripped thumbnailUrl on demand from IndexedDB bytes, so
// cold stubs can drop theirs once the session holds this much.
const MAX_RETAINED_STUB_THUMBNAIL_BYTES = 64 * 1024 * 1024;

const isHeavyThumbnail = (value: string | undefined): boolean =>
  !!value && value.startsWith("data:");

function stubThumbnailBytes(stub: StirlingFileStub): number {
  let bytes = 0;
  if (isHeavyThumbnail(stub.thumbnailUrl)) {
    bytes += stub.thumbnailUrl!.length;
  }
  const processedFile = stub.processedFile;
  // The nested thumbnailUrl is a second full-page data URL (rotated variant),
  // distinct from the stub-level one and the per-page thumbs below.
  if (isHeavyThumbnail(processedFile?.thumbnailUrl)) {
    bytes += processedFile!.thumbnailUrl!.length;
  }
  const pages = processedFile?.pages;
  if (pages) {
    for (const page of pages) {
      if (isHeavyThumbnail(page.thumbnail)) {
        bytes += page.thumbnail!.length;
      }
    }
  }
  return bytes;
}

/**
 * Oldest-first ids whose data-URL thumbnails must go to fit the byte budget.
 * Pinned, selected and just-hydrated files are never candidates: stripping the
 * file that triggered enforcement would ping-pong with its on-demand refill.
 */
export function selectThumbnailEvictionIds(
  state: FileContextState,
  exemptId?: FileId,
  capBytes: number = MAX_RETAINED_STUB_THUMBNAIL_BYTES,
): FileId[] {
  let total = 0;
  for (const id of state.files.ids) {
    total += stubThumbnailBytes(state.files.byId[id]);
  }
  if (total <= capBytes) {
    return [];
  }
  const evict: FileId[] = [];
  for (const id of state.files.ids) {
    if (total <= capBytes) {
      break;
    }
    if (
      id === exemptId ||
      state.pinnedFiles.has(id) ||
      state.ui.selectedFileIds.includes(id)
    ) {
      continue;
    }
    const freed = stubThumbnailBytes(state.files.byId[id]);
    if (freed > 0) {
      evict.push(id);
      total -= freed;
    }
  }
  return evict;
}

/**
 * Resource tracking and cleanup utilities
 */
export class FileLifecycleManager {
  private cleanupTimers = new Map<string, number>();
  private blobUrls = new Set<string>();
  private fileGenerations = new Map<string, number>(); // Generation tokens to prevent stale cleanup

  constructor(
    private filesRef: React.RefObject<Map<FileId, File>>,
    private dispatch: React.Dispatch<FileContextAction>,
  ) {}

  /**
   * Track blob URLs for cleanup
   */
  trackBlobUrl = (url: string): void => {
    // Only track actual blob URLs to avoid trying to revoke other schemes
    if (url.startsWith("blob:")) {
      this.blobUrls.add(url);
    }
  };

  private revokeBlobUrl = (url: string): void => {
    if (!url.startsWith("blob:")) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore revocation errors.
    }
    this.blobUrls.delete(url);
  };

  /**
   * Clean up resources for a specific file (with stateRef access for complete cleanup)
   */
  cleanupFile = (
    fileId: FileId,
    stateRef?: React.RefObject<FileContextState>,
  ): void => {
    forgetFile(fileId);
    // Use comprehensive cleanup (same as removeFiles)
    this.cleanupAllResourcesForFile(fileId, stateRef);

    // Remove file from state
    this.dispatch({ type: "REMOVE_FILES", payload: { fileIds: [fileId] } });
  };

  /**
   * Clean up all files and resources
   */
  cleanupAllFiles = (): void => {
    // Revoke all blob URLs
    this.blobUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revocation errors
      }
    });
    this.blobUrls.clear();

    // Clear all cleanup timers and generations
    this.cleanupTimers.forEach((timer) => clearTimeout(timer));
    this.cleanupTimers.clear();
    this.fileGenerations.clear();

    // No file survives teardown, so neither should its shared document.
    releaseSharedDocumentWhenIdle();

    // Clear files ref
    this.filesRef.current.clear();
  };

  /**
   * Schedule delayed cleanup for a file with generation token to prevent stale cleanup
   */
  scheduleCleanup = (
    fileId: FileId,
    delay: number = 30000,
    stateRef?: React.RefObject<FileContextState>,
  ): void => {
    // Cancel existing timer
    const existingTimer = this.cleanupTimers.get(fileId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.cleanupTimers.delete(fileId);
    }

    // If delay is negative, just cancel (don't reschedule)
    if (delay < 0) {
      return;
    }

    // Increment generation for this file to invalidate any pending cleanup
    const currentGen = (this.fileGenerations.get(fileId) || 0) + 1;
    this.fileGenerations.set(fileId, currentGen);

    // Schedule new cleanup with generation token
    const timer = window.setTimeout(() => {
      // Check if this cleanup is still valid (file hasn't been re-added)
      if (this.fileGenerations.get(fileId) === currentGen) {
        this.cleanupFile(fileId, stateRef);
      } else {
        if (DEBUG)
          console.log(
            `🗂️ Skipped stale cleanup for file ${fileId} (generation mismatch)`,
          );
      }
    }, delay);

    this.cleanupTimers.set(fileId, timer);
  };

  /**
   * Remove a file immediately with complete resource cleanup
   */
  removeFiles = (
    fileIds: FileId[],
    stateRef?: React.RefObject<FileContextState>,
  ): void => {
    fileIds.forEach((fileId) => {
      forgetFile(fileId);
      // Clean up all resources for this file
      this.cleanupAllResourcesForFile(fileId, stateRef);
    });

    // Dispatch removal action once for all files (reducer only updates state)
    this.dispatch({ type: "REMOVE_FILES", payload: { fileIds } });
  };

  /**
   * Complete resource cleanup for a single file
   */
  private cleanupAllResourcesForFile = (
    fileId: FileId,
    stateRef?: React.RefObject<FileContextState>,
  ): void => {
    const file = this.filesRef.current.get(fileId);
    this.filesRef.current.delete(fileId);

    // Cancel cleanup timer and generation
    const timer = this.cleanupTimers.get(fileId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(fileId);
    }
    this.fileGenerations.delete(fileId);

    // A scan queued before this removal can still open the document, so the
    // release runs behind the queue. The byte cache entry is keyed by the file
    // and cannot be reused once it leaves the workbench.
    releaseSharedDocumentWhenIdle();
    if (file) releaseDocumentBytes(file);

    // Clean up blob URLs from file record if we have access to state
    if (stateRef) {
      const record = stateRef.current.files.byId[fileId];
      if (record) {
        // Clean up thumbnail blob URLs
        if (record.thumbnailUrl) this.revokeBlobUrl(record.thumbnailUrl);

        if (record.blobUrl) this.revokeBlobUrl(record.blobUrl);

        // Clean up processed file thumbnails
        if (record.processedFile?.pages) {
          record.processedFile.pages.forEach((page: ProcessedFilePage) => {
            if (page.thumbnail) this.revokeBlobUrl(page.thumbnail);
          });
        }
      }
    }
  };

  /**
   * Update file record with race condition guards
   */
  updateStirlingFileStub = (
    fileId: FileId,
    updates: Partial<StirlingFileStub>,
    stateRef?: React.RefObject<FileContextState>,
  ): void => {
    // Guard against updating removed files (race condition protection)
    if (!this.filesRef.current.has(fileId)) {
      if (DEBUG)
        console.warn(
          `🗂️ Attempted to update removed file (filesRef): ${fileId}`,
        );
      return;
    }

    // Additional state guard for rare race conditions
    if (stateRef && !stateRef.current.files.byId[fileId]) {
      if (DEBUG)
        console.warn(`🗂️ Attempted to update removed file (state): ${fileId}`);
      return;
    }

    // Tools name their output after the held File, not the stub, so a rename
    // must replace it or the next tool run brings the old name back.
    const held = this.filesRef.current.get(fileId);
    if (held && updates.name !== undefined && updates.name !== held.name) {
      const renamed = new File([held], updates.name, {
        type: held.type,
        lastModified: held.lastModified,
      });
      this.filesRef.current.set(fileId, createStirlingFile(renamed, fileId));
    }

    this.dispatch({
      type: "UPDATE_FILE_RECORD",
      payload: { id: fileId, updates },
    });

    // Thumbnail hydration is the only payload that grows without bound, so it
    // is the only one that pays for a budget check. Stripped stubs refill on
    // demand; the triggering file is exempt to avoid a strip/refill ping-pong.
    if (
      stateRef?.current &&
      (updates.thumbnailUrl !== undefined ||
        updates.processedFile !== undefined)
    ) {
      // The dispatch above has not landed in stateRef yet, so select against
      // the state with this update applied: otherwise the update that crosses
      // the budget evicts nothing until the next hydration runs.
      const current = stateRef.current;
      const pendingStub = current.files.byId[fileId];
      const withPending: FileContextState = {
        ...current,
        files: {
          ...current.files,
          byId: {
            ...current.files.byId,
            ...(pendingStub
              ? { [fileId]: { ...pendingStub, ...updates } }
              : {}),
          },
        },
      };
      for (const evictId of selectThumbnailEvictionIds(withPending, fileId)) {
        const stub = withPending.files.byId[evictId];
        const processedFile = stub.processedFile;
        this.dispatch({
          type: "UPDATE_FILE_RECORD",
          payload: {
            id: evictId,
            updates: {
              thumbnailUrl: undefined,
              ...(processedFile
                ? {
                    processedFile: {
                      ...processedFile,
                      thumbnailUrl: undefined,
                      pages: processedFile.pages.map((page) =>
                        isHeavyThumbnail(page.thumbnail)
                          ? { ...page, thumbnail: undefined }
                          : page,
                      ),
                    },
                  }
                : {}),
            },
          },
        });
      }
    }

    // Fire-and-forget: the dispatch above is what the UI reads, and a storage
    // hiccup must not stall it. Worst case the link reverts to its stored value.
    const linkUpdates = persistedSourceFields(updates);
    if (linkUpdates) {
      void import("@app/services/fileStorage")
        .then(({ fileStorage }) =>
          fileStorage.updateFileMetadata(fileId, linkUpdates),
        )
        .catch((error) =>
          console.error(
            `[Lifecycle] Failed to persist disk link for ${fileId}:`,
            error,
          ),
        );
    }

    noteFileSaved(fileId, updates, (patch) =>
      this.dispatch({
        type: "UPDATE_FILE_RECORD",
        payload: { id: fileId, updates: patch },
      }),
    );
  };

  /**
   * Cleanup on unmount
   */
  destroy = (): void => {
    this.cleanupAllFiles();
  };
}
