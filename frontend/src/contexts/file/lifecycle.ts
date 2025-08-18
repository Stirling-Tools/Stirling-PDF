/**
 * File lifecycle management - Resource cleanup and memory management
 */

import { FileId, FileContextAction, FileRecord, ProcessedFilePage } from '../../types/fileContext';

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Resource tracking and cleanup utilities
 */
export class FileLifecycleManager {
  private cleanupTimers = new Map<string, number>();
  private blobUrls = new Set<string>();
  private pdfDocuments = new Map<string, any>();
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
      if (DEBUG) console.log(`🗂️ Tracking blob URL: ${url.substring(0, 50)}...`);
    } else {
      if (DEBUG) console.warn(`🗂️ Attempted to track non-blob URL: ${url.substring(0, 50)}...`);
    }
  };

  /**
   * Track PDF documents for cleanup
   */
  trackPdfDocument = (key: string, pdfDoc: any): void => {
    // Clean up existing PDF document if present
    const existing = this.pdfDocuments.get(key);
    if (existing && typeof existing.destroy === 'function') {
      try {
        existing.destroy();
        if (DEBUG) console.log(`🗂️ Destroyed existing PDF document for key: ${key}`);
      } catch (error) {
        if (DEBUG) console.warn('Error destroying existing PDF document:', error);
      }
    }
    
    this.pdfDocuments.set(key, pdfDoc);
    if (DEBUG) console.log(`🗂️ Tracking PDF document for key: ${key}`);
  };

  /**
   * Clean up resources for a specific file (with stateRef access for complete cleanup)
   */
  cleanupFile = (fileId: string, stateRef?: React.MutableRefObject<any>): void => {
    if (DEBUG) console.log(`🗂️ Cleaning up resources for file: ${fileId}`);
    
    // Use comprehensive cleanup (same as removeFiles)
    this.cleanupAllResourcesForFile(fileId, stateRef);
    
    // Remove file from state
    this.dispatch({ type: 'REMOVE_FILES', payload: { fileIds: [fileId] } });
  };

  /**
   * Clean up all files and resources
   */
  cleanupAllFiles = (): void => {
    if (DEBUG) console.log('🗂️ Cleaning up all files and resources');
    
    // Clean up all PDF documents
    this.pdfDocuments.forEach((pdfDoc, key) => {
      if (pdfDoc && typeof pdfDoc.destroy === 'function') {
        try {
          pdfDoc.destroy();
          if (DEBUG) console.log(`🗂️ Destroyed PDF document for key: ${key}`);
        } catch (error) {
          if (DEBUG) console.warn(`Error destroying PDF document for key ${key}:`, error);
        }
      }
    });
    this.pdfDocuments.clear();
    
    // Revoke all blob URLs
    this.blobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
        if (DEBUG) console.log(`🗂️ Revoked blob URL: ${url.substring(0, 50)}...`);
      } catch (error) {
        if (DEBUG) console.warn('Error revoking blob URL:', error);
      }
    });
    this.blobUrls.clear();
    
    // Clear all cleanup timers and generations
    this.cleanupTimers.forEach(timer => clearTimeout(timer));
    this.cleanupTimers.clear();
    this.fileGenerations.clear();
    
    // Clear files ref
    this.filesRef.current.clear();
    
    if (DEBUG) console.log('🗂️ All resources cleaned up');
  };

  /**
   * Schedule delayed cleanup for a file with generation token to prevent stale cleanup
   */
  scheduleCleanup = (fileId: string, delay: number = 30000, stateRef?: React.MutableRefObject<any>): void => {
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
    if (DEBUG) console.log(`🗂️ Scheduled cleanup for file ${fileId} in ${delay}ms (gen ${currentGen})`);
  };

  /**
   * Remove a file immediately with complete resource cleanup
   */
  removeFiles = (fileIds: FileId[], stateRef?: React.MutableRefObject<any>): void => {
    if (DEBUG) console.log(`🗂️ Removing ${fileIds.length} files immediately`);
    
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
    
    // Clean up PDF documents (scan all keys that start with fileId)
    const keysToDelete: string[] = [];
    this.pdfDocuments.forEach((pdfDoc, key) => {
      if (key === fileId || key.startsWith(`${fileId}:`)) {
        if (pdfDoc && typeof pdfDoc.destroy === 'function') {
          try {
            pdfDoc.destroy();
            keysToDelete.push(key);
            if (DEBUG) console.log(`🗂️ Destroyed PDF document for key: ${key}`);
          } catch (error) {
            if (DEBUG) console.warn(`Error destroying PDF document for key ${key}:`, error);
          }
        }
      }
    });
    keysToDelete.forEach(key => this.pdfDocuments.delete(key));
    
    // Cancel cleanup timer and generation
    const timer = this.cleanupTimers.get(fileId);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(fileId);
      if (DEBUG) console.log(`🗂️ Cancelled cleanup timer for file: ${fileId}`);
    }
    this.fileGenerations.delete(fileId);
    
    // Clean up blob URLs from file record if we have access to state
    if (stateRef) {
      const record = stateRef.current.files.byId[fileId];
      if (record) {
        // Revoke blob URLs from file record
        if (record.thumbnailUrl && record.thumbnailUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(record.thumbnailUrl);
            if (DEBUG) console.log(`🗂️ Revoked thumbnail blob URL for file: ${fileId}`);
          } catch (error) {
            if (DEBUG) console.warn('Error revoking thumbnail URL:', error);
          }
        }
        
        if (record.blobUrl && record.blobUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(record.blobUrl);
            if (DEBUG) console.log(`🗂️ Revoked file blob URL for file: ${fileId}`);
          } catch (error) {
            if (DEBUG) console.warn('Error revoking file URL:', error);
          }
        }
        
        // Clean up processed file thumbnails
        if (record.processedFile?.pages) {
          record.processedFile.pages.forEach((page: ProcessedFilePage, index: number) => {
            if (page.thumbnail && page.thumbnail.startsWith('blob:')) {
              try {
                URL.revokeObjectURL(page.thumbnail);
                if (DEBUG) console.log(`🗂️ Revoked page ${index} thumbnail for file: ${fileId}`);
              } catch (error) {
                if (DEBUG) console.warn('Error revoking page thumbnail URL:', error);
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
  updateFileRecord = (fileId: FileId, updates: Partial<FileRecord>, stateRef?: React.MutableRefObject<any>): void => {
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
    if (DEBUG) console.log('🗂️ FileLifecycleManager destroying - cleaning up all resources');
    this.cleanupAllFiles();
  };
}