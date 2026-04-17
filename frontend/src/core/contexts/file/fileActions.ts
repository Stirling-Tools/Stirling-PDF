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
} from "@app/types/fileContext";
import { FileId, ToolOperation } from "@app/types/file";
import { generateThumbnailWithMetadata } from "@app/utils/thumbnailUtils";
import { FileLifecycleManager } from "@app/contexts/file/lifecycle";
import { buildQuickKeySet } from "@app/contexts/file/fileSelectors";
import { StirlingFile } from "@app/types/fileContext";
import { fileStorage } from "@app/services/fileStorage";
import { zipFileService } from "@app/services/zipFileService";
import { FileAnalyzer } from "@app/services/fileAnalyzer";
const DEBUG = process.env.NODE_ENV === "development";
const HYDRATION_CONCURRENCY = 2;
let activeHydrations = 0;
const hydrationQueue: Array<() => Promise<void>> = [];

const scheduleMetadataHydration = (task: () => Promise<void>): void => {
  hydrationQueue.push(task);
  // Defer start to next tick to ensure initial ADD_FILES dispatch completes
  Promise.resolve().then(drainHydrationQueue);
};

const drainHydrationQueue = (): void => {
  if (activeHydrations >= HYDRATION_CONCURRENCY) {
    return;
  }
  const nextTask = hydrationQueue.shift();
  if (!nextTask) return;

  activeHydrations++;
  nextTask()
    .catch((error) => {
      console.error("[Hydration] Task failed with error:", error);
    })
    .finally(() => {
      activeHydrations--;
      drainHydrationQueue();
    });
};

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
export function createProcessedFile(
  pageCount: number,
  thumbnail?: string,
  pageRotations?: number[],
  pageDimensions?: Array<{ width: number; height: number }>,
): ProcessedFileMetadata {
  return {
    totalPages: pageCount,
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      thumbnail: index === 0 ? thumbnail : undefined, // Only first page gets thumbnail initially
      rotation: pageRotations?.[index] ?? 0,
      splitBefore: false,
      width: pageDimensions?.[index]?.width,
      height: pageDimensions?.[index]?.height,
    })),
    thumbnailUrl: thumbnail,
    lastProcessed: Date.now(),
  };
}

/**
 * Generate fresh ProcessedFileMetadata for a file
 * Used when tools process files to ensure metadata matches actual file content
 */
export async function generateProcessedFileMetadata(file: File): Promise<ProcessedFileMetadata | undefined> {
  // Only generate metadata for PDF files
  if (!file.type.startsWith("application/pdf")) {
    return undefined;
  }

  try {
    // Generate unrotated thumbnails for PageEditor (rotation applied via CSS)
    const unrotatedResult = await generateThumbnailWithMetadata(file, false);

    // Generate rotated thumbnail for file manager display
    const rotatedResult = await generateThumbnailWithMetadata(file, true);

    const processedFile = createProcessedFile(
      unrotatedResult.pageCount,
      unrotatedResult.thumbnail, // Page thumbnails (unrotated)
      unrotatedResult.pageRotations,
      unrotatedResult.pageDimensions,
    );

    // Use rotated thumbnail for file manager
    processedFile.thumbnailUrl = rotatedResult.thumbnail;

    if (unrotatedResult.isEncrypted || rotatedResult.isEncrypted) {
      processedFile.isEncrypted = true;
    }

    return processedFile;
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
  operation: ToolOperation,
  resultingFile: File,
  thumbnail?: string,
  processedFileMetadata?: ProcessedFileMetadata,
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

  const childStub = {
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
    processedFile: processedFileMetadata,

    // Mark as dirty if parent has a localFilePath (modified file not yet saved to disk)
    isDirty: parentStub.localFilePath ? true : undefined,
  };

  if (DEBUG) {
    console.log("[createChildStub] Created child:", {
      childId: newFileId,
      parentId: parentStub.id,
      parentLocalFilePath: parentStub.localFilePath,
      childLocalFilePath: childStub.localFilePath,
      childIsDirty: childStub.isDirty,
      versionNumber: newVersionNumber,
    });
  }

  return childStub;
}

interface AddFileOptions {
  files?: File[];

  // For 'processed' files
  filesWithThumbnails?: Array<{ file: File; thumbnail?: string; pageCount?: number }>;

  // Insertion position
  insertAfterPageId?: string;

  // Auto-selection after adding
  selectFiles?: boolean;

  // Auto-unzip control
  autoUnzip?: boolean;
  autoUnzipFileLimit?: number;
  skipAutoUnzip?: boolean; // When true: always unzip (except HTML). Used for file uploads. When false: respect autoUnzip/autoUnzipFileLimit preferences. Used for tool outputs.
  confirmLargeExtraction?: (fileCount: number, fileName: string) => Promise<boolean>; // Optional callback to confirm extraction of large ZIP files
  allowDuplicates?: boolean;
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
  enablePersistence: boolean = false,
): Promise<StirlingFile[]> {
  // Acquire mutex to prevent race conditions
  await addFilesMutex.lock();

  try {
    const stirlingFileStubs: StirlingFileStub[] = [];
    const stirlingFiles: StirlingFile[] = [];
    // Hydration tasks are scheduled per-file to update thumbnails/metadata without blocking add flow

    // Build quickKey lookup from existing files for deduplication
    const existingQuickKeys = buildQuickKeySet(stateRef.current.files.byId);

    const { files = [], allowDuplicates = false } = options;

    // ZIP pre-processing: Extract ZIP files with configurable behavior
    // - File uploads: skipAutoUnzip=true → always extract (except HTML)
    // - Tool outputs: skipAutoUnzip=false → respect user preferences
    const filesToProcess: File[] = [];
    const autoUnzip = options.autoUnzip ?? true; // Default to true
    const autoUnzipFileLimit = options.autoUnzipFileLimit ?? 4; // Default limit
    const skipAutoUnzip = options.skipAutoUnzip ?? false;
    const confirmLargeExtraction = options.confirmLargeExtraction;

    for (const file of files) {
      // Check if file is a ZIP
      if (zipFileService.isZipFile(file)) {
        try {
          if (DEBUG) console.log(`📄 addFiles: Detected ZIP file: ${file.name}`);

          // Check if ZIP contains HTML files - if so, keep as ZIP
          const containsHtml = await zipFileService.containsHtmlFiles(file);
          if (containsHtml) {
            if (DEBUG) console.log(`📄 addFiles: ZIP contains HTML, keeping as ZIP: ${file.name}`);
            filesToProcess.push(file);
            continue;
          }

          // Apply extraction with preferences
          const extractedFiles = await zipFileService.extractWithPreferences(file, {
            autoUnzip,
            autoUnzipFileLimit,
            skipAutoUnzip,
            confirmLargeExtraction,
          });

          if (extractedFiles.length === 1 && extractedFiles[0] === file) {
            // ZIP was not extracted (over limit or autoUnzip disabled)
            if (DEBUG) console.log(`📄 addFiles: ZIP not extracted (preferences): ${file.name}`);
          } else {
            // ZIP was extracted
            if (DEBUG) console.log(`📄 addFiles: Extracted ${extractedFiles.length} files from ZIP: ${file.name}`);
          }

          filesToProcess.push(...extractedFiles);
        } catch (error) {
          console.error(`📄 addFiles: Failed to process ZIP file ${file.name}:`, error);
          // On error, keep the ZIP file as-is
          filesToProcess.push(file);
        }
      } else {
        // Not a ZIP file, add as-is
        filesToProcess.push(file);
      }
    }

    if (DEBUG) console.log(`📄 addFiles: After ZIP processing, ${filesToProcess.length} files to add`);

    // Collect hydrations to schedule after dispatch so updateStirlingFileStub finds files in state.
    const pendingHydrations: Array<() => Promise<void>> = [];

    for (const file of filesToProcess) {
      const quickKey = createQuickKey(file);

      // Soft deduplication: Check if file already exists by metadata
      if (!allowDuplicates && existingQuickKeys.has(quickKey)) {
        continue;
      }

      const fileId = createFileId();
      filesRef.current.set(fileId, file);

      // Create new filestub with minimal metadata; hydrate thumbnails/processedFile asynchronously
      const fileStub = createNewStirlingFileStub(file, fileId);

      // Early encryption detection for PDFs — set the flag before dispatch so the
      // viewer gate and modal queue pick it up immediately instead of after hydration
      if (file.type === "application/pdf") {
        try {
          if (await FileAnalyzer.isPDFUserPasswordProtected(file)) {
            fileStub.processedFile = (fileStub.processedFile || { pages: [] }) as any;
            fileStub.processedFile!.isEncrypted = true;
          }
        } catch (error) {
          // Never block upload on analysis failure — but log so it's debuggable
          // if an unencrypted file later appears to "hang" during processing.
          console.warn("[FileActions] Early encryption detection failed for", file.name, error);
        }
      }

      // Check for pending file path mapping from Tauri file dialog (desktop only)
      try {
        const { pendingFilePathMappings } = await import("@app/services/pendingFilePathMappings");
        console.log(`[FileActions] Checking for localFilePath mapping for quickKey: ${quickKey}`);
        console.log(`[FileActions] Available mappings:`, Array.from(pendingFilePathMappings.keys()));
        const localFilePath = pendingFilePathMappings.get(quickKey);
        if (localFilePath) {
          console.log(`[FileActions] ✓ Found localFilePath: ${localFilePath}`);
          fileStub.localFilePath = localFilePath;
          pendingFilePathMappings.delete(quickKey); // Clean up after use
          console.log(`[FileActions] Applied localFilePath to file: ${file.name}`);
        } else {
          console.log(`[FileActions] ✗ No localFilePath found for this file`);
        }
      } catch (error) {
        console.log("[FileActions] Could not check for localFilePath:", error);
        // FileManagerContext may not be available in all contexts
      }

      // Store insertion position if provided
      if (options.insertAfterPageId !== undefined) {
        fileStub.insertAfterPageId = options.insertAfterPageId;
      }

      if (!allowDuplicates) {
        existingQuickKeys.add(quickKey);
      }
      stirlingFileStubs.push(fileStub);

      // Create StirlingFile directly
      const stirlingFile = createStirlingFile(file, fileId);
      stirlingFiles.push(stirlingFile);

      // Capture per-file hydration task — scheduled after batch dispatch below
      pendingHydrations.push(async () => {
        const targetFile = filesRef.current.get(fileId);
        if (!targetFile) {
          return;
        }

        let processedFileMetadata: ProcessedFileMetadata | undefined;
        let thumbnail: string | undefined;

        if (targetFile.type.startsWith("application/pdf")) {
          if (fileStub.processedFile?.isEncrypted) {
            // Pre-dispatch detection already flagged this PDF as encrypted; PDF.js
            // can't produce thumbnails/metadata without the password, so re-parsing
            // here would just duplicate work. Metadata is refreshed after unlock.
            processedFileMetadata = fileStub.processedFile;
          } else {
            processedFileMetadata = await generateProcessedFileMetadata(targetFile);
            thumbnail = processedFileMetadata?.thumbnailUrl;
          }
        } else {
          try {
            const { generateThumbnailForFile } = await import("@app/utils/thumbnailUtils");
            thumbnail = await generateThumbnailForFile(targetFile);
          } catch (error) {
            console.warn(`[addFiles] Thumbnail generation failed for ${fileId}:`, error);
          }
        }

        const updates: Partial<StirlingFileStub> = {};
        const primaryThumbnail =
          thumbnail || processedFileMetadata?.thumbnailUrl || processedFileMetadata?.pages?.[0]?.thumbnail;

        if (processedFileMetadata) {
          updates.processedFile = processedFileMetadata;
          updates.thumbnailUrl = primaryThumbnail;
        } else if (thumbnail) {
          updates.thumbnailUrl = primaryThumbnail;
        }

        if (primaryThumbnail && primaryThumbnail.startsWith("blob:")) {
          lifecycleManager.trackBlobUrl(primaryThumbnail);
        }

        if (Object.keys(updates).length > 0) {
          lifecycleManager.updateStirlingFileStub(fileId, updates, stateRef);
        }

        // Persist the thumbnail to IndexedDB so it's available in future sessions.
        // The file was stored before hydration ran, so it had no thumbnail yet.
        // Skip blob URLs — they're session-only and won't be valid after reload.
        if (primaryThumbnail && enablePersistence && !primaryThumbnail.startsWith("blob:")) {
          try {
            await fileStorage.updateThumbnail(fileId, primaryThumbnail);
          } catch {
            // Non-critical — regenerated lazily on next hover
          }
        }
      });
    }

    // Batch dispatch all files at once — one render instead of N sequential renders
    if (stirlingFileStubs.length > 0) {
      dispatch({ type: "ADD_FILES", payload: { stirlingFileStubs } });
    }

    // Schedule hydrations after dispatch so updateStirlingFileStub finds files in state
    for (const task of pendingHydrations) {
      scheduleMetadataHydration(task);
    }

    // Persist to storage if enabled using fileStorage service
    if (enablePersistence && stirlingFiles.length > 0) {
      await Promise.all(
        stirlingFiles.map(async (stirlingFile, index) => {
          try {
            // Get corresponding stub with all metadata
            const fileStub = stirlingFileStubs[index];

            // Store using the cleaner signature - pass StirlingFile + StirlingFileStub directly
            await fileStorage.storeStirlingFile(stirlingFile, fileStub);

            if (DEBUG) console.log(`📄 addFiles: Stored file ${stirlingFile.name} with metadata:`, fileStub);
          } catch (error) {
            console.error("Failed to persist file to storage:", stirlingFile.name, error);
          }
        }),
      );
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
  dispatch: React.Dispatch<FileContextAction>,
): Promise<FileId[]> {
  if (DEBUG)
    console.log(
      `📄 consumeFiles: Processing ${inputFileIds.length} input files, ${outputStirlingFiles.length} output files with pre-created stubs`,
    );

  // Validate that we have matching files and stubs
  if (outputStirlingFiles.length !== outputStirlingFileStubs.length) {
    throw new Error(
      `Mismatch between output files (${outputStirlingFiles.length}) and stubs (${outputStirlingFileStubs.length})`,
    );
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
  if (!outputStirlingFileStubs.reduce((areAllV1, stub) => areAllV1 && stub.versionNumber == 1, true)) {
    await Promise.all(
      inputFileIds.map(async (fileId) => {
        try {
          await fileStorage.markFileAsProcessed(fileId);
          if (DEBUG) console.log(`📄 Marked file ${fileId} as processed (no longer leaf)`);
        } catch (error) {
          if (DEBUG) console.warn(`📄 Failed to mark file ${fileId} as processed:`, error);
        }
      }),
    );
  }

  // Save output files directly to fileStorage with complete metadata
  for (let i = 0; i < outputStirlingFiles.length; i++) {
    const stirlingFile = outputStirlingFiles[i];
    const stub = outputStirlingFileStubs[i];

    try {
      // Use fileStorage directly with complete metadata from stub
      await fileStorage.storeStirlingFile(stirlingFile, stub);

      if (DEBUG)
        console.log(`📄 Saved StirlingFile ${stirlingFile.name} directly to storage with complete metadata:`, {
          fileId: stirlingFile.fileId,
          versionNumber: stub.versionNumber,
          originalFileId: stub.originalFileId,
          parentFileId: stub.parentFileId,
          toolChainLength: stub.toolHistory?.length || 0,
        });
    } catch (error) {
      console.error("Failed to persist output file to fileStorage:", stirlingFile.name, error);
    }
  }

  // Dispatch the consume action with pre-created stubs (no processing needed)
  dispatch({
    type: "CONSUME_FILES",
    payload: {
      inputFileIds,
      outputStirlingFileStubs: outputStirlingFileStubs,
    },
  });

  if (DEBUG)
    console.log(
      `📄 consumeFiles: Successfully consumed files - removed ${inputFileIds.length} inputs, added ${outputStirlingFileStubs.length} outputs`,
    );
  // Return the output file IDs for undo tracking
  return outputStirlingFileStubs.map((stub) => stub.id);
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
  indexedDB?: {
    saveFile: (file: File, fileId: FileId, existingThumbnail?: string) => Promise<any>;
    deleteFile: (fileId: FileId) => Promise<void>;
  } | null,
): Promise<void> {
  if (DEBUG)
    console.log(
      `📄 undoConsumeFiles: Restoring ${inputStirlingFileStubs.length} input files, removing ${outputFileIds.length} output files`,
    );

  // Validate inputs
  if (inputFiles.length !== inputStirlingFileStubs.length) {
    throw new Error(`Mismatch between input files (${inputFiles.length}) and records (${inputStirlingFileStubs.length})`);
  }

  // Create a backup of current filesRef state for rollback
  const backupFilesRef = new Map(filesRef.current);

  try {
    // Sync filesRef before dispatch — prevents bumpRevision re-renders from seeing stale output IDs with no File objects.
    outputFileIds.forEach((id) => filesRef.current.delete(id));
    inputFiles.forEach((file, index) => {
      const record = inputStirlingFileStubs[index];
      if (file && record && file.size > 0) {
        filesRef.current.set(record.id, file);
      }
    });

    // Mark restored files dirty if they have a local path (they now differ from disk).
    const stubsWithDirtyMarked = inputStirlingFileStubs.map((stub) =>
      stub.localFilePath ? { ...stub, isDirty: true } : stub,
    );

    // Dispatch with filesRef and state.files.ids now in sync.
    dispatch({
      type: "UNDO_CONSUME_FILES",
      payload: {
        inputStirlingFileStubs: stubsWithDirtyMarked,
        outputFileIds,
      },
    });

    // IDB cleanup fire-and-forget — state is already consistent when bumpRevision fires.
    if (indexedDB) {
      outputFileIds.forEach((fileId) => {
        indexedDB.deleteFile(fileId).catch((error) => {
          console.error("📄 undoConsumeFiles: Failed to delete output file from IDB:", fileId, error);
        });
      });
    }

    // Restore isLeaf in IDB — modal reads IDB directly and misses files if isLeaf=false.
    await Promise.all(
      inputStirlingFileStubs.map((stub) =>
        fileStorage.markFileAsLeaf(stub.id).catch((error) => {
          console.warn(`📄 undoConsumeFiles: Failed to restore isLeaf for ${stub.id}:`, error);
        }),
      ),
    );

    if (DEBUG)
      console.log(
        `📄 undoConsumeFiles: Successfully undone consume operation - restored ${inputStirlingFileStubs.length} inputs, removed ${outputFileIds.length} outputs`,
      );
  } catch (error) {
    // Rollback filesRef to previous state
    if (DEBUG) console.error("📄 undoConsumeFiles: Error during undo, rolling back filesRef", error);
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
  lifecycleManager: FileLifecycleManager,
): Promise<StirlingFile[]> {
  await addFilesMutex.lock();

  try {
    // Show loading indicator while preparing files from storage
    if (stirlingFileStubs.length > 0) {
      dispatch({ type: "SET_PROCESSING", payload: { isProcessing: true, progress: 0 } });
    }

    const existingQuickKeys = buildQuickKeySet(stateRef.current.files.byId);
    const loadedFiles: StirlingFile[] = [];
    let firstFileDispatched = false;

    // Process and dispatch files one by one for progressive UI updates
    for (const stub of stirlingFileStubs) {
      // Check for duplicates using quickKey
      if (existingQuickKeys.has(stub.quickKey || "")) {
        if (DEBUG) console.log(`📄 Skipping duplicate StirlingFileStub: ${stub.name}`);
        continue;
      }

      // Use the original stub (preserves thumbnails, history, metadata!)
      const record = { ...stub };

      // Store insertion position if provided
      if (options.insertAfterPageId !== undefined) {
        record.insertAfterPageId = options.insertAfterPageId;
      }

      existingQuickKeys.add(stub.quickKey || "");

      // Dispatch each file immediately as we process it (progressive loading)
      dispatch({ type: "ADD_FILES", payload: { stirlingFileStubs: [record] } });

      // Clear loading indicator after first file appears
      if (!firstFileDispatched) {
        firstFileDispatched = true;
        dispatch({ type: "SET_PROCESSING", payload: { isProcessing: false, progress: 0 } });
      }

      // Load File object and hydrate metadata in background (non-blocking)
      const fileId = stub.id;

      // Load File object from IndexedDB asynchronously
      scheduleMetadataHydration(async () => {
        const stirlingFile = await fileStorage.getStirlingFile(fileId);
        if (!stirlingFile) {
          return;
        }

        // Store the loaded file in filesRef
        filesRef.current.set(fileId, stirlingFile);

        // Check if processedFile data needs regeneration
        if (stirlingFile.type.startsWith("application/pdf")) {
          const needsProcessing =
            !stub.processedFile ||
            !stub.processedFile.pages ||
            stub.processedFile.pages.length === 0 ||
            stub.processedFile.totalPages !== stub.processedFile.pages.length;

          if (needsProcessing) {
            // Regenerate metadata
            const processedFileMetadata = await generateProcessedFileMetadata(stirlingFile);

            if (processedFileMetadata) {
              const updates: Partial<StirlingFileStub> = {
                processedFile: processedFileMetadata,
              };

              // Update thumbnail only if current stub doesn't have one
              const currentStub = stateRef.current.files.byId[fileId];
              if (!currentStub?.thumbnailUrl && processedFileMetadata.thumbnailUrl) {
                updates.thumbnailUrl = processedFileMetadata.thumbnailUrl;
                if (processedFileMetadata.thumbnailUrl.startsWith("blob:")) {
                  lifecycleManager.trackBlobUrl(processedFileMetadata.thumbnailUrl);
                }
              }

              lifecycleManager.updateStirlingFileStub(fileId, updates, stateRef);
            }
          }
        }
      });
    }

    return loadedFiles;
  } finally {
    addFilesMutex.unlock();
  }
}

export const createFileActions = (dispatch: React.Dispatch<FileContextAction>) => ({
  setSelectedFiles: (fileIds: FileId[]) => dispatch({ type: "SET_SELECTED_FILES", payload: { fileIds } }),
  setSelectedPages: (pageNumbers: number[]) => dispatch({ type: "SET_SELECTED_PAGES", payload: { pageNumbers } }),
  clearSelections: () => dispatch({ type: "CLEAR_SELECTIONS" }),
  setProcessing: (isProcessing: boolean, progress = 0) =>
    dispatch({ type: "SET_PROCESSING", payload: { isProcessing, progress } }),
  setHasUnsavedChanges: (hasChanges: boolean) => dispatch({ type: "SET_UNSAVED_CHANGES", payload: { hasChanges } }),
  pinFile: (fileId: FileId) => dispatch({ type: "PIN_FILE", payload: { fileId } }),
  unpinFile: (fileId: FileId) => dispatch({ type: "UNPIN_FILE", payload: { fileId } }),
  resetContext: () => dispatch({ type: "RESET_CONTEXT" }),
  markFileError: (fileId: FileId) => dispatch({ type: "MARK_FILE_ERROR", payload: { fileId } }),
  clearFileError: (fileId: FileId) => dispatch({ type: "CLEAR_FILE_ERROR", payload: { fileId } }),
  clearAllFileErrors: () => dispatch({ type: "CLEAR_ALL_FILE_ERRORS" }),
  updateStirlingFileStub: (fileId: FileId, updates: Partial<StirlingFileStub>) =>
    dispatch({ type: "UPDATE_FILE_RECORD", payload: { id: fileId, updates } }),
});
