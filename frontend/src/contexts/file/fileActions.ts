/**
 * File actions - Unified file operations with single addFiles helper
 */

import {
  StirlingFileStub,
  FileContextAction,
  FileContextState,
  toStirlingFileStub,
  createFileId,
  createQuickKey
} from '../../types/fileContext';
import { FileId, FileMetadata } from '../../types/file';
import { generateThumbnailWithMetadata } from '../../utils/thumbnailUtils';
import { FileLifecycleManager } from './lifecycle';
import { buildQuickKeySet } from './fileSelectors';
import { extractBasicFileMetadata } from '../../utils/fileHistoryUtils';

const DEBUG = process.env.NODE_ENV === 'development';

/**
 * Simple mutex to prevent race conditions in addFiles
 */
class SimpleMutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async lock(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.locked = true;
        resolve();
      });
    });
  }

  unlock(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }
}

// Global mutex for addFiles operations
const addFilesMutex = new SimpleMutex();

/**
 * Helper to create ProcessedFile metadata structure
 */
export function createProcessedFile(pageCount: number, thumbnail?: string) {
  return {
    totalPages: pageCount,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      thumbnail: index === 0 ? thumbnail : undefined, // Only first page gets thumbnail initially
      rotation: 0,
      splitBefore: false
    })),
    thumbnailUrl: thumbnail,
    lastProcessed: Date.now()
  };
}

/**
 * File addition types
 */
type AddFileKind = 'raw' | 'processed' | 'stored';

interface AddFileOptions {
  // For 'raw' files
  files?: File[];

  // For 'processed' files
  filesWithThumbnails?: Array<{ file: File; thumbnail?: string; pageCount?: number }>;

  // For 'stored' files
  filesWithMetadata?: Array<{ file: File; originalId: FileId; metadata: FileMetadata }>;

  // Insertion position
  insertAfterPageId?: string;
}

export interface AddedFile {
  file: File;
  id: FileId;
  thumbnail?: string;
}

/**
 * Unified file addition helper - replaces addFiles/addProcessedFiles/addStoredFiles
 */
export async function addFiles(
  kind: AddFileKind,
  options: AddFileOptions,
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  dispatch: React.Dispatch<FileContextAction>,
  lifecycleManager: FileLifecycleManager
): Promise<AddedFile[]> {
  // Acquire mutex to prevent race conditions
  await addFilesMutex.lock();

  try {
    const stirlingFileStubs: StirlingFileStub[] = [];
    const addedFiles: AddedFile[] = [];

  // Build quickKey lookup from existing files for deduplication
  const existingQuickKeys = buildQuickKeySet(stateRef.current.files.byId);
  if (DEBUG) console.log(`📄 addFiles(${kind}): Existing quickKeys for deduplication:`, Array.from(existingQuickKeys));

  switch (kind) {
    case 'raw': {
      const { files = [] } = options;
      if (DEBUG) console.log(`📄 addFiles(raw): Adding ${files.length} files with immediate thumbnail generation`);

      for (const file of files) {
        const quickKey = createQuickKey(file);

        // Soft deduplication: Check if file already exists by metadata
        if (existingQuickKeys.has(quickKey)) {
          if (DEBUG) console.log(`📄 Skipping duplicate file: ${file.name} (quickKey: ${quickKey})`);
          continue;
        }
        if (DEBUG) console.log(`📄 Adding new file: ${file.name} (quickKey: ${quickKey})`);

        const fileId = createFileId();
        filesRef.current.set(fileId, file);

        // Generate thumbnail and page count immediately
        let thumbnail: string | undefined;
        let pageCount: number = 1;

        // Route based on file type - PDFs through full metadata pipeline, non-PDFs through simple path
        if (file.type.startsWith('application/pdf')) {
          try {
            if (DEBUG) console.log(`📄 Generating PDF metadata for ${file.name}`);
            const result = await generateThumbnailWithMetadata(file);
            thumbnail = result.thumbnail;
            pageCount = result.pageCount;
            if (DEBUG) console.log(`📄 Generated PDF metadata for ${file.name}: ${pageCount} pages, thumbnail: SUCCESS`);
          } catch (error) {
            if (DEBUG) console.warn(`📄 Failed to generate PDF metadata for ${file.name}:`, error);
          }
        } else {
          // Non-PDF files: simple thumbnail generation, no page count
          try {
            if (DEBUG) console.log(`📄 Generating simple thumbnail for non-PDF file ${file.name}`);
            const { generateThumbnailForFile } = await import('../../utils/thumbnailUtils');
            thumbnail = await generateThumbnailForFile(file);
            pageCount = 0; // Non-PDFs have no page count
            if (DEBUG) console.log(`📄 Generated simple thumbnail for ${file.name}: no page count, thumbnail: SUCCESS`);
          } catch (error) {
            if (DEBUG) console.warn(`📄 Failed to generate simple thumbnail for ${file.name}:`, error);
          }
        }

        // Create record with immediate thumbnail and page metadata
        const record = toStirlingFileStub(file, fileId);
        if (thumbnail) {
          record.thumbnailUrl = thumbnail;
          // Track blob URLs for cleanup (images return blob URLs that need revocation)
          if (thumbnail.startsWith('blob:')) {
            lifecycleManager.trackBlobUrl(thumbnail);
          }
        }

        // Store insertion position if provided
        if (options.insertAfterPageId !== undefined) {
          record.insertAfterPageId = options.insertAfterPageId;
        }

        // Create initial processedFile metadata with page count
        if (pageCount > 0) {
          record.processedFile = createProcessedFile(pageCount, thumbnail);
          if (DEBUG) console.log(`📄 addFiles(raw): Created initial processedFile metadata for ${file.name} with ${pageCount} pages`);
        }

        // Extract basic metadata (version number and tool chain) for display
        extractBasicFileMetadata(file, record).then(updatedRecord => {
          if (updatedRecord !== record && (updatedRecord.versionNumber || updatedRecord.toolHistory)) {
            // Basic metadata found, dispatch update to trigger re-render
            dispatch({
              type: 'UPDATE_FILE_RECORD',
              payload: {
                id: fileId,
                updates: {
                  versionNumber: updatedRecord.versionNumber,
                  toolHistory: updatedRecord.toolHistory
                }
              }
            });
          }
        }).catch(error => {
          if (DEBUG) console.warn(`📄 Failed to extract basic metadata for ${file.name}:`, error);
        });

        existingQuickKeys.add(quickKey);
        stirlingFileStubs.push(record);
        addedFiles.push({ file, id: fileId, thumbnail });
        }
      break;
    }

    case 'processed': {
      const { filesWithThumbnails = [] } = options;
      if (DEBUG) console.log(`📄 addFiles(processed): Adding ${filesWithThumbnails.length} processed files with pre-existing thumbnails`);

      for (const { file, thumbnail, pageCount = 1 } of filesWithThumbnails) {
        const quickKey = createQuickKey(file);

        if (existingQuickKeys.has(quickKey)) {
          if (DEBUG) console.log(`📄 Skipping duplicate processed file: ${file.name}`);
          continue;
        }

        const fileId = createFileId();
        filesRef.current.set(fileId, file);

        const record = toStirlingFileStub(file, fileId);
        if (thumbnail) {
          record.thumbnailUrl = thumbnail;
          // Track blob URLs for cleanup (images return blob URLs that need revocation)
          if (thumbnail.startsWith('blob:')) {
            lifecycleManager.trackBlobUrl(thumbnail);
          }
        }

        // Store insertion position if provided
        if (options.insertAfterPageId !== undefined) {
          record.insertAfterPageId = options.insertAfterPageId;
        }

        // Create processedFile with provided metadata
        if (pageCount > 0) {
          record.processedFile = createProcessedFile(pageCount, thumbnail);
          if (DEBUG) console.log(`📄 addFiles(processed): Created initial processedFile metadata for ${file.name} with ${pageCount} pages`);
        }

        // Extract basic metadata (version number and tool chain) for display
        extractBasicFileMetadata(file, record).then(updatedRecord => {
          if (updatedRecord !== record && (updatedRecord.versionNumber || updatedRecord.toolHistory)) {
            // Basic metadata found, dispatch update to trigger re-render
            dispatch({
              type: 'UPDATE_FILE_RECORD',
              payload: {
                id: fileId,
                updates: {
                  versionNumber: updatedRecord.versionNumber,
                  toolHistory: updatedRecord.toolHistory
                }
              }
            });
          }
        }).catch(error => {
          if (DEBUG) console.warn(`📄 Failed to extract basic metadata for ${file.name}:`, error);
        });

        existingQuickKeys.add(quickKey);
        stirlingFileStubs.push(record);
        addedFiles.push({ file, id: fileId, thumbnail });
      }
      break;
    }

    case 'stored': {
      const { filesWithMetadata = [] } = options;
      if (DEBUG) console.log(`📄 addFiles(stored): Restoring ${filesWithMetadata.length} files from storage with existing metadata`);

      for (const { file, originalId, metadata } of filesWithMetadata) {
        const quickKey = createQuickKey(file);

        if (existingQuickKeys.has(quickKey)) {
          if (DEBUG) console.log(`📄 Skipping duplicate stored file: ${file.name} (quickKey: ${quickKey})`);
          continue;
        }
        if (DEBUG) console.log(`📄 Adding stored file: ${file.name} (quickKey: ${quickKey})`);

        // Try to preserve original ID, but generate new if it conflicts
        let fileId = originalId;
        if (filesRef.current.has(originalId)) {
          fileId = createFileId();
          if (DEBUG) console.log(`📄 ID conflict for stored file ${file.name}, using new ID: ${fileId}`);
        }

        filesRef.current.set(fileId, file);

        const record = toStirlingFileStub(file, fileId);

        // Generate processedFile metadata for stored files
        let pageCount: number = 1;

        // Only process PDFs through PDF worker manager, non-PDFs have no page count
        if (file.type.startsWith('application/pdf')) {
          try {
            if (DEBUG) console.log(`📄 addFiles(stored): Generating PDF metadata for stored file ${file.name}`);

            // Get page count from PDF
            const arrayBuffer = await file.arrayBuffer();
            const { pdfWorkerManager } = await import('../../services/pdfWorkerManager');
            const pdf = await pdfWorkerManager.createDocument(arrayBuffer);
            pageCount = pdf.numPages;
            pdfWorkerManager.destroyDocument(pdf);

            if (DEBUG) console.log(`📄 addFiles(stored): Found ${pageCount} pages in PDF ${file.name}`);
          } catch (error) {
            if (DEBUG) console.warn(`📄 addFiles(stored): Failed to generate PDF metadata for ${file.name}:`, error);
          }
        } else {
          pageCount = 0; // Non-PDFs have no page count
          if (DEBUG) console.log(`📄 addFiles(stored): Non-PDF file ${file.name}, no page count`);
        }

        // Restore metadata from storage
        if (metadata.thumbnail) {
          record.thumbnailUrl = metadata.thumbnail;
          // Track blob URLs for cleanup (images return blob URLs that need revocation)
          if (metadata.thumbnail.startsWith('blob:')) {
            lifecycleManager.trackBlobUrl(metadata.thumbnail);
          }
        }

        // Store insertion position if provided
        if (options.insertAfterPageId !== undefined) {
          record.insertAfterPageId = options.insertAfterPageId;
        }

        // Create processedFile metadata with correct page count
        if (pageCount > 0) {
          record.processedFile = createProcessedFile(pageCount, metadata.thumbnail);
          if (DEBUG) console.log(`📄 addFiles(stored): Created processedFile metadata for ${file.name} with ${pageCount} pages`);
        }

        // Extract basic metadata (version number and tool chain) for display
        extractBasicFileMetadata(file, record).then(updatedRecord => {
          if (updatedRecord !== record && (updatedRecord.versionNumber || updatedRecord.toolHistory)) {
            // Basic metadata found, dispatch update to trigger re-render
            dispatch({
              type: 'UPDATE_FILE_RECORD',
              payload: {
                id: fileId,
                updates: {
                  versionNumber: updatedRecord.versionNumber,
                  toolHistory: updatedRecord.toolHistory
                }
              }
            });
          }
        }).catch(error => {
          if (DEBUG) console.warn(`📄 Failed to extract basic metadata for ${file.name}:`, error);
        });

        existingQuickKeys.add(quickKey);
        stirlingFileStubs.push(record);
        addedFiles.push({ file, id: fileId, thumbnail: metadata.thumbnail });

      }
      break;
    }
  }

  // Dispatch ADD_FILES action if we have new files
  if (stirlingFileStubs.length > 0) {
    dispatch({ type: 'ADD_FILES', payload: { stirlingFileStubs } });
    if (DEBUG) console.log(`📄 addFiles(${kind}): Successfully added ${stirlingFileStubs.length} files`);
  }

  return addedFiles;
  } finally {
    // Always release mutex even if error occurs
    addFilesMutex.unlock();
  }
}

/**
 * Helper function to process files into records with thumbnails and metadata
 */
async function processFilesIntoRecords(
  files: File[],
  filesRef: React.MutableRefObject<Map<FileId, File>>
): Promise<Array<{ record: StirlingFileStub; file: File; fileId: FileId; thumbnail?: string }>> {
  return Promise.all(
    files.map(async (file) => {
      const fileId = createFileId();
      filesRef.current.set(fileId, file);

      // Generate thumbnail and page count
      let thumbnail: string | undefined;
      let pageCount: number = 1;

      try {
        if (DEBUG) console.log(`📄 Generating thumbnail for file ${file.name}`);
        const result = await generateThumbnailWithMetadata(file);
        thumbnail = result.thumbnail;
        pageCount = result.pageCount;
      } catch (error) {
        if (DEBUG) console.warn(`📄 Failed to generate thumbnail for file ${file.name}:`, error);
      }

      const record = toStirlingFileStub(file, fileId);
      if (thumbnail) {
        record.thumbnailUrl = thumbnail;
      }

      if (pageCount > 0) {
        record.processedFile = createProcessedFile(pageCount, thumbnail);
      }

      // Extract basic metadata synchronously during consumeFiles for immediate display
      if (file.type.includes('pdf')) {
        try {
          const updatedRecord = await extractBasicFileMetadata(file, record);

          if (updatedRecord !== record && (updatedRecord.versionNumber || updatedRecord.toolHistory)) {
            // Update the record directly with basic metadata
            Object.assign(record, {
              versionNumber: updatedRecord.versionNumber,
              toolHistory: updatedRecord.toolHistory
            });
          }
        } catch (error) {
          if (DEBUG) console.warn(`📄 Failed to extract basic metadata for ${file.name}:`, error);
        }
      }

      return { record, file, fileId, thumbnail };
    })
  );
}

/**
 * Helper function to persist files to IndexedDB
 */
async function persistFilesToIndexedDB(
  stirlingFileStubs: Array<{ file: File; fileId: FileId; thumbnail?: string }>,
  indexedDB: { saveFile: (file: File, fileId: FileId, existingThumbnail?: string) => Promise<any> }
): Promise<void> {
  await Promise.all(stirlingFileStubs.map(async ({ file, fileId, thumbnail }) => {
    try {
      await indexedDB.saveFile(file, fileId, thumbnail);
    } catch (error) {
      console.error('Failed to persist file to IndexedDB:', file.name, error);
    }
  }));
}

/**
 * Consume files helper - replace unpinned input files with output files
 */
export async function consumeFiles(
  inputFileIds: FileId[],
  outputFiles: File[],
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  dispatch: React.Dispatch<FileContextAction>,
  indexedDB?: { saveFile: (file: File, fileId: FileId, existingThumbnail?: string) => Promise<any>; markFileAsProcessed: (fileId: FileId) => Promise<boolean> } | null
): Promise<FileId[]> {
  if (DEBUG) console.log(`📄 consumeFiles: Processing ${inputFileIds.length} input files, ${outputFiles.length} output files`);

  // Process output files with thumbnails and metadata
  const outputStirlingFileStubs = await processFilesIntoRecords(outputFiles, filesRef);

  // Mark input files as processed in IndexedDB (no longer leaf nodes) and save output files
  if (indexedDB) {
    // Mark input files as processed (isLeaf = false)
    await Promise.all(
      inputFileIds.map(async (fileId) => {
        try {
          await indexedDB.markFileAsProcessed(fileId);
          if (DEBUG) console.log(`📄 Marked file ${fileId} as processed (no longer leaf)`);
        } catch (error) {
          if (DEBUG) console.warn(`📄 Failed to mark file ${fileId} as processed:`, error);
        }
      })
    );

    // Save output files to IndexedDB
    await persistFilesToIndexedDB(outputStirlingFileStubs, indexedDB);
  }

  // Dispatch the consume action
  dispatch({
    type: 'CONSUME_FILES',
    payload: {
      inputFileIds,
      outputStirlingFileStubs: outputStirlingFileStubs.map(({ record }) => record)
    }
  });

  if (DEBUG) console.log(`📄 consumeFiles: Successfully consumed files - removed ${inputFileIds.length} inputs, added ${outputStirlingFileStubs.length} outputs`);
  // Return the output file IDs for undo tracking
  return outputStirlingFileStubs.map(({ fileId }) => fileId);
}

/**
 * Helper function to restore files to filesRef and manage IndexedDB cleanup
 */
async function restoreFilesAndCleanup(
  filesToRestore: Array<{ file: File; record: StirlingFileStub }>,
  fileIdsToRemove: FileId[],
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  indexedDB?: { deleteFile: (fileId: FileId) => Promise<void> } | null
): Promise<void> {
  // Remove files from filesRef
  fileIdsToRemove.forEach(id => {
    if (filesRef.current.has(id)) {
      if (DEBUG) console.log(`📄 Removing file ${id} from filesRef`);
      filesRef.current.delete(id);
    } else {
      if (DEBUG) console.warn(`📄 File ${id} not found in filesRef`);
    }
  });

  // Restore files to filesRef
  filesToRestore.forEach(({ file, record }) => {
    if (file && record) {
      // Validate the file before restoring
      if (file.size === 0) {
        if (DEBUG) console.warn(`📄 Skipping empty file ${file.name}`);
        return;
      }

      // Restore the file to filesRef
      if (DEBUG) console.log(`📄 Restoring file ${file.name} with id ${record.id} to filesRef`);
      filesRef.current.set(record.id, file);
    }
  });

  // Clean up IndexedDB
  if (indexedDB) {
    const indexedDBPromises = fileIdsToRemove.map(fileId =>
      indexedDB.deleteFile(fileId).catch(error => {
        console.error('Failed to delete file from IndexedDB:', fileId, error);
        throw error; // Re-throw to trigger rollback
      })
    );

    // Execute all IndexedDB operations
    await Promise.all(indexedDBPromises);
  }
}

/**
 * Undoes a previous consumeFiles operation by restoring input files and removing output files (unless pinned)
 */
export async function undoConsumeFiles(
  inputFiles: File[],
  inputStirlingFileStubs: StirlingFileStub[],
  outputFileIds: FileId[],
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  dispatch: React.Dispatch<FileContextAction>,
  indexedDB?: { saveFile: (file: File, fileId: FileId, existingThumbnail?: string) => Promise<any>; deleteFile: (fileId: FileId) => Promise<void> } | null
): Promise<void> {
  if (DEBUG) console.log(`📄 undoConsumeFiles: Restoring ${inputStirlingFileStubs.length} input files, removing ${outputFileIds.length} output files`);

  // Validate inputs
  if (inputFiles.length !== inputStirlingFileStubs.length) {
    throw new Error(`Mismatch between input files (${inputFiles.length}) and records (${inputStirlingFileStubs.length})`);
  }

  // Create a backup of current filesRef state for rollback
  const backupFilesRef = new Map(filesRef.current);

  try {
    // Prepare files to restore
    const filesToRestore = inputFiles.map((file, index) => ({
      file,
      record: inputStirlingFileStubs[index]
    }));

    // Restore input files and clean up output files
    await restoreFilesAndCleanup(
      filesToRestore,
      outputFileIds,
      filesRef,
      indexedDB
    );

    // Dispatch the undo action (only if everything else succeeded)
    dispatch({
      type: 'UNDO_CONSUME_FILES',
      payload: {
        inputStirlingFileStubs,
        outputFileIds
      }
    });

    if (DEBUG) console.log(`📄 undoConsumeFiles: Successfully undone consume operation - restored ${inputStirlingFileStubs.length} inputs, removed ${outputFileIds.length} outputs`);
  } catch (error) {
    // Rollback filesRef to previous state
    if (DEBUG) console.error('📄 undoConsumeFiles: Error during undo, rolling back filesRef', error);
    filesRef.current.clear();
    backupFilesRef.forEach((file, id) => {
      filesRef.current.set(id, file);
    });
    throw error; // Re-throw to let caller handle
  }
}

/**
 * Action factory functions
 */
export const createFileActions = (dispatch: React.Dispatch<FileContextAction>) => ({
  setSelectedFiles: (fileIds: FileId[]) => dispatch({ type: 'SET_SELECTED_FILES', payload: { fileIds } }),
  setSelectedPages: (pageNumbers: number[]) => dispatch({ type: 'SET_SELECTED_PAGES', payload: { pageNumbers } }),
  clearSelections: () => dispatch({ type: 'CLEAR_SELECTIONS' }),
  setProcessing: (isProcessing: boolean, progress = 0) => dispatch({ type: 'SET_PROCESSING', payload: { isProcessing, progress } }),
  setHasUnsavedChanges: (hasChanges: boolean) => dispatch({ type: 'SET_UNSAVED_CHANGES', payload: { hasChanges } }),
  pinFile: (fileId: FileId) => dispatch({ type: 'PIN_FILE', payload: { fileId } }),
  unpinFile: (fileId: FileId) => dispatch({ type: 'UNPIN_FILE', payload: { fileId } }),
  resetContext: () => dispatch({ type: 'RESET_CONTEXT' })
});
