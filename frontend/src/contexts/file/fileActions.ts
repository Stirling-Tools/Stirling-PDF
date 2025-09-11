/**
 * File actions - Unified file operations with single addFiles helper
 */

import {
  StirlingFileStub,
  FileContextAction,
  FileContextState,
  createNewStirlingFileStub,
  createFileId,
  createQuickKey,
  createStirlingFile,
  ProcessedFileMetadata,
} from '../../types/fileContext';
import { FileId } from '../../types/file';
import { generateThumbnailWithMetadata } from '../../utils/thumbnailUtils';
import { FileLifecycleManager } from './lifecycle';
import { buildQuickKeySet } from './fileSelectors';
import { StirlingFile } from '../../types/fileContext';
import { fileStorage } from '../../services/fileStorage';
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
 * Generate fresh ProcessedFileMetadata for a file
 * Used when tools process files to ensure metadata matches actual file content
 */
export async function generateProcessedFileMetadata(file: File): Promise<ProcessedFileMetadata | undefined> {
  // Only generate metadata for PDF files
  if (!file.type.startsWith('application/pdf')) {
    return undefined;
  }

  try {
    const result = await generateThumbnailWithMetadata(file);
      return createProcessedFile(result.pageCount, result.thumbnail);
  } catch (error) {
    if (DEBUG) console.warn(`📄 Failed to generate processedFileMetadata for ${file.name}:`, error);
  }

  return undefined;
}

/**
 * Create a child StirlingFileStub from a parent stub with proper history management.
 * Used when a tool processes an existing file to create a new version with incremented history.
 *
 * @param parentStub - The parent StirlingFileStub to create a child from
 * @param operation - Tool operation information (toolName, timestamp)
 * @param resultingFile - The processed File object
 * @param thumbnail - Optional thumbnail for the child
 * @param processedFileMetadata - Optional fresh metadata for the processed file
 * @returns New child StirlingFileStub with proper version history
 */
export function createChildStub(
  parentStub: StirlingFileStub,
  operation: { toolName: string; timestamp: number },
  resultingFile: File,
  thumbnail?: string,
  processedFileMetadata?: ProcessedFileMetadata
): StirlingFileStub {
  const newFileId = createFileId();

  // Build new tool history by appending to parent's history
  const parentToolHistory = parentStub.toolHistory || [];
  const newToolHistory = [...parentToolHistory, operation];

  // Calculate new version number
  const newVersionNumber = (parentStub.versionNumber || 1) + 1;

  // Determine original file ID (root of the version chain)
  const originalFileId = parentStub.originalFileId || parentStub.id;

  // Copy parent metadata but exclude processedFile to prevent stale data
  const { processedFile: _processedFile, ...parentMetadata } = parentStub;

  return {
    // Copy parent metadata (excluding processedFile)
    ...parentMetadata,

    // Update identity and version info
    id: newFileId,
    versionNumber: newVersionNumber,
    parentFileId: parentStub.id,
    originalFileId: originalFileId,
    toolHistory: newToolHistory,
    createdAt: Date.now(),
    isLeaf: true, // New child is the current leaf node
    name: resultingFile.name,
    size: resultingFile.size,
    type: resultingFile.type,
    lastModified: resultingFile.lastModified,
    thumbnailUrl: thumbnail,

    // Set fresh processedFile metadata (no inheritance from parent)
    processedFile: processedFileMetadata
  };
}

interface AddFileOptions {
  files?: File[];

  // For 'processed' files
  filesWithThumbnails?: Array<{ file: File; thumbnail?: string; pageCount?: number }>;

  // Insertion position
  insertAfterPageId?: string;

  // Auto-selection after adding
  selectFiles?: boolean;
}

/**
 * Unified file addition helper - replaces addFiles
 */
export async function addFiles(
  options: AddFileOptions,
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  dispatch: React.Dispatch<FileContextAction>,
  lifecycleManager: FileLifecycleManager,
  enablePersistence: boolean = false
): Promise<StirlingFile[]> {
  // Acquire mutex to prevent race conditions
  await addFilesMutex.lock();

  try {
    const stirlingFileStubs: StirlingFileStub[] = [];
    const stirlingFiles: StirlingFile[] = [];

  // Build quickKey lookup from existing files for deduplication
  const existingQuickKeys = buildQuickKeySet(stateRef.current.files.byId);

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

    // Generate processedFile metadata using centralized function
    const processedFileMetadata = await generateProcessedFileMetadata(file);

    // Extract thumbnail for non-PDF files or use from processedFile for PDFs
    let thumbnail: string | undefined;
    if (processedFileMetadata) {
      // PDF file - use thumbnail from processedFile metadata
      thumbnail = processedFileMetadata.thumbnailUrl;
      if (DEBUG) console.log(`📄 Generated PDF metadata for ${file.name}: ${processedFileMetadata.totalPages} pages, thumbnail: SUCCESS`);
    } else if (!file.type.startsWith('application/pdf')) {
      // Non-PDF files: simple thumbnail generation, no processedFile metadata
      try {
        if (DEBUG) console.log(`📄 Generating simple thumbnail for non-PDF file ${file.name}`);
        const { generateThumbnailForFile } = await import('../../utils/thumbnailUtils');
        thumbnail = await generateThumbnailForFile(file);
        if (DEBUG) console.log(`📄 Generated simple thumbnail for ${file.name}: no page count, thumbnail: SUCCESS`);
      } catch (error) {
        if (DEBUG) console.warn(`📄 Failed to generate simple thumbnail for ${file.name}:`, error);
      }
    }

    // Create new filestub with processedFile metadata
    const fileStub = createNewStirlingFileStub(file, fileId, thumbnail, processedFileMetadata);
    if (thumbnail) {
      // Track blob URLs for cleanup (images return blob URLs that need revocation)
      if (thumbnail.startsWith('blob:')) {
        lifecycleManager.trackBlobUrl(thumbnail);
      }
    }

    // Store insertion position if provided
    if (options.insertAfterPageId !== undefined) {
      fileStub.insertAfterPageId = options.insertAfterPageId;
    }

    existingQuickKeys.add(quickKey);
    stirlingFileStubs.push(fileStub);

    // Create StirlingFile directly
    const stirlingFile = createStirlingFile(file, fileId);
    stirlingFiles.push(stirlingFile);
  }

  // Persist to storage if enabled using fileStorage service
  if (enablePersistence && stirlingFiles.length > 0) {
    await Promise.all(stirlingFiles.map(async (stirlingFile, index) => {
      try {
        // Get corresponding stub with all metadata
        const fileStub = stirlingFileStubs[index];

        // Store using the cleaner signature - pass StirlingFile + StirlingFileStub directly
        await fileStorage.storeStirlingFile(stirlingFile, fileStub);

        if (DEBUG) console.log(`📄 addFiles: Stored file ${stirlingFile.name} with metadata:`, fileStub);
      } catch (error) {
        console.error('Failed to persist file to storage:', stirlingFile.name, error);
      }
    }));
  }

  // Dispatch ADD_FILES action if we have new files
  if (stirlingFileStubs.length > 0) {
    dispatch({ type: 'ADD_FILES', payload: { stirlingFileStubs } });
  }

  return stirlingFiles;
  } finally {
    // Always release mutex even if error occurs
    addFilesMutex.unlock();
  }
}


/**
 * Consume files helper - replace unpinned input files with output files
 * Now accepts pre-created StirlingFiles and StirlingFileStubs to preserve all metadata
 */
export async function consumeFiles(
  inputFileIds: FileId[],
  outputStirlingFiles: StirlingFile[],
  outputStirlingFileStubs: StirlingFileStub[],
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  dispatch: React.Dispatch<FileContextAction>
): Promise<FileId[]> {
  if (DEBUG) console.log(`📄 consumeFiles: Processing ${inputFileIds.length} input files, ${outputStirlingFiles.length} output files with pre-created stubs`);

  // Validate that we have matching files and stubs
  if (outputStirlingFiles.length !== outputStirlingFileStubs.length) {
    throw new Error(`Mismatch between output files (${outputStirlingFiles.length}) and stubs (${outputStirlingFileStubs.length})`);
  }

  // Store StirlingFiles in filesRef using their existing IDs (no ID generation needed)
  for (let i = 0; i < outputStirlingFiles.length; i++) {
    const stirlingFile = outputStirlingFiles[i];
    const stub = outputStirlingFileStubs[i];

    if (stirlingFile.fileId !== stub.id) {
      console.warn(`📄 consumeFiles: ID mismatch between StirlingFile (${stirlingFile.fileId}) and stub (${stub.id})`);
    }

    filesRef.current.set(stirlingFile.fileId, stirlingFile);

    if (DEBUG) console.log(`📄 consumeFiles: Stored StirlingFile ${stirlingFile.name} with ID ${stirlingFile.fileId}`);
  }

  // Mark input files as processed in storage (no longer leaf nodes)
  if(!outputStirlingFileStubs.reduce((areAllV1, stub) => areAllV1 && (stub.versionNumber == 1), true)) {
    await Promise.all(
      inputFileIds.map(async (fileId) => {
        try {
          await fileStorage.markFileAsProcessed(fileId);
          if (DEBUG) console.log(`📄 Marked file ${fileId} as processed (no longer leaf)`);
        } catch (error) {
          if (DEBUG) console.warn(`📄 Failed to mark file ${fileId} as processed:`, error);
        }
      })
    );
  }

  // Save output files directly to fileStorage with complete metadata
  for (let i = 0; i < outputStirlingFiles.length; i++) {
    const stirlingFile = outputStirlingFiles[i];
    const stub = outputStirlingFileStubs[i];

    try {
      // Use fileStorage directly with complete metadata from stub
      await fileStorage.storeStirlingFile(stirlingFile, stub);

      if (DEBUG) console.log(`📄 Saved StirlingFile ${stirlingFile.name} directly to storage with complete metadata:`, {
        fileId: stirlingFile.fileId,
        versionNumber: stub.versionNumber,
        originalFileId: stub.originalFileId,
        parentFileId: stub.parentFileId,
        toolChainLength: stub.toolHistory?.length || 0
      });
    } catch (error) {
      console.error('Failed to persist output file to fileStorage:', stirlingFile.name, error);
    }
  }

  // Dispatch the consume action with pre-created stubs (no processing needed)
  dispatch({
    type: 'CONSUME_FILES',
    payload: {
      inputFileIds,
      outputStirlingFileStubs: outputStirlingFileStubs
    }
  });

  if (DEBUG) console.log(`📄 consumeFiles: Successfully consumed files - removed ${inputFileIds.length} inputs, added ${outputStirlingFileStubs.length} outputs`);
  // Return the output file IDs for undo tracking
  return outputStirlingFileStubs.map(stub => stub.id);
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

/**
 * Add files using existing StirlingFileStubs from storage - preserves all metadata
 * Use this when loading files that already exist in storage (FileManager, etc.)
 * StirlingFileStubs come with proper thumbnails, history, processing state
 */
export async function addStirlingFileStubs(
  stirlingFileStubs: StirlingFileStub[],
  options: { insertAfterPageId?: string; selectFiles?: boolean } = {},
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  dispatch: React.Dispatch<FileContextAction>,
  _lifecycleManager: FileLifecycleManager
): Promise<StirlingFile[]> {
  await addFilesMutex.lock();

  try {
    if (DEBUG) console.log(`📄 addStirlingFileStubs: Adding ${stirlingFileStubs.length} StirlingFileStubs preserving metadata`);

    const existingQuickKeys = buildQuickKeySet(stateRef.current.files.byId);
    const validStubs: StirlingFileStub[] = [];
    const loadedFiles: StirlingFile[] = [];

    for (const stub of stirlingFileStubs) {
      // Check for duplicates using quickKey
      if (existingQuickKeys.has(stub.quickKey || '')) {
        if (DEBUG) console.log(`📄 Skipping duplicate StirlingFileStub: ${stub.name}`);
        continue;
      }

      // Load the actual StirlingFile from storage
      const stirlingFile = await fileStorage.getStirlingFile(stub.id);
      if (!stirlingFile) {
        console.warn(`📄 Failed to load StirlingFile for stub: ${stub.name} (${stub.id})`);
        continue;
      }

      // Store the loaded file in filesRef
      filesRef.current.set(stub.id, stirlingFile);

      // Use the original stub (preserves thumbnails, history, metadata!)
      const record = { ...stub };

      // Store insertion position if provided
      if (options.insertAfterPageId !== undefined) {
        record.insertAfterPageId = options.insertAfterPageId;
      }

      // Check if processedFile data needs regeneration for proper Page Editor support
      if (stirlingFile.type.startsWith('application/pdf')) {
        const needsProcessing = !record.processedFile ||
                                !record.processedFile.pages ||
                                record.processedFile.pages.length === 0 ||
                                record.processedFile.totalPages !== record.processedFile.pages.length;

        if (needsProcessing) {
          if (DEBUG) console.log(`📄 addStirlingFileStubs: Regenerating processedFile for ${record.name}`);

          // Use centralized metadata generation function
          const processedFileMetadata = await generateProcessedFileMetadata(stirlingFile);
          if (processedFileMetadata) {
            record.processedFile = processedFileMetadata;
            record.thumbnailUrl = processedFileMetadata.thumbnailUrl; // Update thumbnail if needed
            if (DEBUG) console.log(`📄 addStirlingFileStubs: Regenerated processedFile for ${record.name} with ${processedFileMetadata.totalPages} pages`);
          } else {
            // Fallback for files that couldn't be processed
            if (DEBUG) console.warn(`📄 addStirlingFileStubs: Failed to regenerate processedFile for ${record.name}`);
            if (!record.processedFile) {
              record.processedFile = createProcessedFile(1); // Fallback to 1 page
            }
          }
        }
      }

      existingQuickKeys.add(stub.quickKey || '');
      validStubs.push(record);
      loadedFiles.push(stirlingFile);
    }

    // Dispatch ADD_FILES action if we have new files
    if (validStubs.length > 0) {
      dispatch({ type: 'ADD_FILES', payload: { stirlingFileStubs: validStubs } });
      if (DEBUG) console.log(`📄 addStirlingFileStubs: Successfully added ${validStubs.length} files with preserved metadata`);
    }

    return loadedFiles;
  } finally {
    addFilesMutex.unlock();
  }
}

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
