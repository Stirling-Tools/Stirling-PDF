/**
 * File actions - Unified file operations with single addFiles helper
 */

import { 
  FileId, 
  FileRecord, 
  FileContextAction,
  FileContextState,
  toFileRecord,
  createFileId,
  createQuickKey
} from '../../types/fileContext';
import { FileMetadata } from '../../types/file';
import { generateThumbnailWithMetadata } from '../../utils/thumbnailUtils';
import { FileLifecycleManager } from './lifecycle';
import { fileProcessingService } from '../../services/fileProcessingService';
import { buildQuickKeySet, buildQuickKeySetFromMetadata } from './fileSelectors';

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
): Promise<Array<{ file: File; id: FileId; thumbnail?: string }>> {
  // Acquire mutex to prevent race conditions
  await addFilesMutex.lock();
  
  try {
  const fileRecords: FileRecord[] = [];
  const addedFiles: Array<{ file: File; id: FileId; thumbnail?: string }> = [];
  
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
        const record = toFileRecord(file, fileId);
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
        
        existingQuickKeys.add(quickKey);
        fileRecords.push(record);
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
        
        const record = toFileRecord(file, fileId);
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
        
        existingQuickKeys.add(quickKey);
        fileRecords.push(record);
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
        
        const record = toFileRecord(file, fileId);
        
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
        
        existingQuickKeys.add(quickKey);
        fileRecords.push(record);
        addedFiles.push({ file, id: fileId, thumbnail: metadata.thumbnail });
        
      }
      break;
    }
  }
  
  // Dispatch ADD_FILES action if we have new files
  if (fileRecords.length > 0) {
    dispatch({ type: 'ADD_FILES', payload: { fileRecords } });
    if (DEBUG) console.log(`📄 addFiles(${kind}): Successfully added ${fileRecords.length} files`);
  }
  
  return addedFiles;
  } finally {
    // Always release mutex even if error occurs
    addFilesMutex.unlock();
  }
}

/**
 * Consume files helper - replace unpinned input files with output files
 */
export async function consumeFiles(
  inputFileIds: FileId[],
  outputFiles: File[],
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  dispatch: React.Dispatch<FileContextAction>
): Promise<Array<{ file: File; id: FileId; thumbnail?: string }>> {
  if (DEBUG) console.log(`📄 consumeFiles: Processing ${inputFileIds.length} input files, ${outputFiles.length} output files`);
  
  // Process output files through the 'processed' path to generate thumbnails
  const processedOutputs: Array<{ file: File; id: FileId; thumbnail?: string; record: FileRecord }> = await Promise.all(
    outputFiles.map(async (file) => {
      const fileId = createFileId();
      filesRef.current.set(fileId, file);
      
      // Generate thumbnail and page count for output file
      let thumbnail: string | undefined;
      let pageCount: number = 1;
      
      try {
        if (DEBUG) console.log(`📄 consumeFiles: Generating thumbnail for output file ${file.name}`);
        const result = await generateThumbnailWithMetadata(file);
        thumbnail = result.thumbnail;
        pageCount = result.pageCount;
      } catch (error) {
        if (DEBUG) console.warn(`📄 consumeFiles: Failed to generate thumbnail for output file ${file.name}:`, error);
      }
      
      const record = toFileRecord(file, fileId);
      if (thumbnail) {
        record.thumbnailUrl = thumbnail;
      }
      
      if (pageCount > 0) {
        record.processedFile = createProcessedFile(pageCount, thumbnail);
      }
      
      return { file, id: fileId, thumbnail, record };
    })
  );
  
  const outputFileRecords = processedOutputs.map(({ record }) => record);
  
  // Dispatch the consume action
  dispatch({ 
    type: 'CONSUME_FILES', 
    payload: { 
      inputFileIds, 
      outputFileRecords 
    } 
  });
  
  if (DEBUG) console.log(`📄 consumeFiles: Successfully consumed files - removed ${inputFileIds.length} inputs, added ${outputFileRecords.length} outputs`);
  
  return processedOutputs.map(({ file, id, thumbnail }) => ({ file, id, thumbnail }));
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
