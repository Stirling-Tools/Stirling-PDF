/**
 * File lifecycle management - Resource cleanup and memory management
 */

import { FileId } from '@app/types/file';
import { FileContextAction, StirlingFileStub, ProcessedFilePage } from '@app/types/fileContext';

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Resource tracking and cleanup utilities
 */
export class FileLifecycleManager {
  private cleanupTimers = new Map<string, number>();
  private blobUrls = new Set<string>();
  private fileGenerations = new Map<string, number>(); // Generation tokens to prevent stale cleanup

  constructor(
    private filesRef: React.MutableRefObject<Map<FileId, File>>,
    private dispatch: React.Dispatch<FileContextAction>
  ) {}

  /**
   * Track blob URLs for cleanup
   */
  trackBlobUrl = (url: string): void => {
    // Only track actual blob URLs to avoid trying to revoke other schemes
    if (url.startsWith('blob:')) {
      this.blobUrls.add(url);
    }
  };


  /**
   * Clean up resources for a specific file (with stateRef access for complete cleanup)
   */
  cleanupFile = (fileId: FileId, stateRef?: React.MutableRefObject<any>): void => {
    // Use comprehensive cleanup (same as removeFiles)
    this.cleanupAllResourcesForFile(fileId, stateRef);

    // Remove file from state
    this.dispatch({ type: 'REMOVE_FILES', payload: { fileIds: [fileId] } });
  };

  /**
   * Clean up all files and resources
   */
  cleanupAllFiles = (): void => {
    // Revoke all blob URLs
    this.blobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore revocation errors
      }
    });
    this.blobUrls.clear();

    // Clear all cleanup timers and generations
    this.cleanupTimers.forEach(timer => clearTimeout(timer));
    this.cleanupTimers.clear();
    this.fileGenerations.clear();

    // Clear files ref
    this.filesRef.current.clear();
  };

  /**
   * Schedule delayed cleanup for a file with generation token to prevent stale cleanup
   */
  scheduleCleanup = (fileId: FileId, delay: number = 30000, stateRef?: React.MutableRefObject<any>): void => {
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
        if (DEBUG) console.log(`🗂️ Skipped stale cleanup for file ${fileId} (generation mismatch)`);
      }
    }, delay);

    this.cleanupTimers.set(fileId, timer);
  };

  /**
   * Remove a file immediately with complete resource cleanup
   */
  removeFiles = (fileIds: FileId[], stateRef?: React.MutableRefObject<any>): void => {
    fileIds.forEach(fileId => {
      // Clean up all resources for this file
      this.cleanupAllResourcesForFile(fileId, stateRef);
    });

    // Dispatch removal action once for all files (reducer only updates state)
    this.dispatch({ type: 'REMOVE_FILES', payload: { fileIds } });
  };

  /**
   * Complete resource cleanup for a single file
   */
  private cleanupAllResourcesForFile = (fileId: FileId, stateRef?: React.MutableRefObject<any>): void => {
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
        if (record.thumbnailUrl && record.thumbnailUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(record.thumbnailUrl);
          } catch {
            // Ignore revocation errors
          }
        }

        if (record.blobUrl && record.blobUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(record.blobUrl);
          } catch {
            // Ignore revocation errors
          }
        }

        // Clean up processed file thumbnails
        if (record.processedFile?.pages) {
          record.processedFile.pages.forEach((page: ProcessedFilePage) => {
            if (page.thumbnail && page.thumbnail.startsWith('blob:')) {
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
  updateStirlingFileStub = (fileId: FileId, updates: Partial<StirlingFileStub>, stateRef?: React.MutableRefObject<any>): void => {
    // Guard against updating removed files (race condition protection)
    if (!this.filesRef.current.has(fileId)) {
      if (DEBUG) console.warn(`🗂️ Attempted to update removed file (filesRef): ${fileId}`);
      return;
    }

    // Additional state guard for rare race conditions
    if (stateRef && !stateRef.current.files.byId[fileId]) {
      if (DEBUG) console.warn(`🗂️ Attempted to update removed file (state): ${fileId}`);
      return;
    }

    this.dispatch({ type: 'UPDATE_FILE_RECORD', payload: { id: fileId, updates } });
  };

  /**
   * Cleanup on unmount
   */
  destroy = (): void => {
    this.cleanupAllFiles();
  };
}
