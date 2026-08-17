/**
 * File lifecycle management - Resource cleanup and memory management
 */

import { FileId } from "@app/types/file";
import {
  FileContextAction,
  FileContextState,
  StirlingFileStub,
  ProcessedFilePage,
} from "@app/types/fileContext";

const DEBUG = process.env.NODE_ENV === "development";

/**
 * Stub fields describing the link to a file on disk. Every other stub field is
 * either already persisted at store time or is runtime-only display state, but
 * these are edited long after the record was written - a save stamps
 * `localFilePath`/`isDirty`, a disk re-read stamps the baseline - and if they
 * stay in memory the link dies on reload and the app silently falls back to its
 * stale copy. So updates touching them are mirrored into IndexedDB.
 */
const DISK_LINK_FIELDS = [
  "localFilePath",
  "isDirty",
  "diskSyncedSize",
  "diskSyncedModifiedMs",
  "orphanedFilePath",
  "diskConflictAt",
  "diskReloadedAt",
] as const satisfies readonly (keyof StirlingFileStub)[];

function diskLinkUpdates(
  updates: Partial<StirlingFileStub>,
): Partial<StirlingFileStub> | null {
  const persisted: Partial<StirlingFileStub> = {};
  let found = false;
  for (const field of DISK_LINK_FIELDS) {
    if (field in updates) {
      // Object.assign-style copy keeps each field's own type.
      (persisted as Record<string, unknown>)[field] = updates[field];
      found = true;
    }
  }
  return found ? persisted : null;
}

/**
 * Resource tracking and cleanup utilities
 */
export class FileLifecycleManager {
  private cleanupTimers = new Map<string, number>();
  private blobUrls = new Set<string>();
  private fileGenerations = new Map<string, number>(); // Generation tokens to prevent stale cleanup

  constructor(
    private filesRef: React.MutableRefObject<Map<FileId, File>>,
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

  /**
   * Clean up resources for a specific file (with stateRef access for complete cleanup)
   */
  cleanupFile = (
    fileId: FileId,
    stateRef?: React.MutableRefObject<FileContextState>,
  ): void => {
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

    // Clear files ref
    this.filesRef.current.clear();
  };

  /**
   * Schedule delayed cleanup for a file with generation token to prevent stale cleanup
   */
  scheduleCleanup = (
    fileId: FileId,
    delay: number = 30000,
    stateRef?: React.MutableRefObject<FileContextState>,
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
    stateRef?: React.MutableRefObject<FileContextState>,
  ): void => {
    fileIds.forEach((fileId) => {
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
    stateRef?: React.MutableRefObject<FileContextState>,
  ): void => {
    // Remove from files ref
    this.filesRef.current.delete(fileId);

    // Cancel cleanup timer and generation
    const timer = this.cleanupTimers.get(fileId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(fileId);
    }
    this.fileGenerations.delete(fileId);

    // Clean up blob URLs from file record if we have access to state
    if (stateRef) {
      const record = stateRef.current.files.byId[fileId];
      if (record) {
        // Clean up thumbnail blob URLs
        if (record.thumbnailUrl && record.thumbnailUrl.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(record.thumbnailUrl);
          } catch {
            // Ignore revocation errors
          }
        }

        if (record.blobUrl && record.blobUrl.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(record.blobUrl);
          } catch {
            // Ignore revocation errors
          }
        }

        // Clean up processed file thumbnails
        if (record.processedFile?.pages) {
          record.processedFile.pages.forEach((page: ProcessedFilePage) => {
            if (page.thumbnail && page.thumbnail.startsWith("blob:")) {
              try {
                URL.revokeObjectURL(page.thumbnail);
              } catch {
                // Ignore revocation errors
              }
            }
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
    stateRef?: React.MutableRefObject<FileContextState>,
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

    this.dispatch({
      type: "UPDATE_FILE_RECORD",
      payload: { id: fileId, updates },
    });

    // Fire-and-forget: the dispatch above is what the UI reads, and a storage
    // hiccup must not stall it. Worst case the link reverts to its stored value.
    const linkUpdates = diskLinkUpdates(updates);
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

    // A save just made disk and app agree, so re-baseline against the file we
    // wrote. Without this the next open reads it back as an external change.
    if (updates.isDirty === false && updates.localFilePath) {
      const path = updates.localFilePath;
      void import("@app/services/diskFileSync")
        .then(({ refreshDiskBaselineAfterSave }) =>
          refreshDiskBaselineAfterSave(fileId, path),
        )
        .then((baseline) => {
          if (baseline) {
            this.dispatch({
              type: "UPDATE_FILE_RECORD",
              payload: { id: fileId, updates: baseline },
            });
          }
        })
        .catch((error) =>
          console.error(
            `[Lifecycle] Failed to re-baseline ${fileId} after save:`,
            error,
          ),
        );
    }
  };

  /**
   * Cleanup on unmount
   */
  destroy = (): void => {
    this.cleanupAllFiles();
  };
}
