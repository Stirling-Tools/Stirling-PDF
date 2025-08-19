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
import { fileProcessingService } from '../../services/fileProcessingService';
import { buildQuickKeySet, buildQuickKeySetFromMetadata } from './fileSelectors';

const DEBUG = process.env.NODE_ENV === 'development';

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
}

/**
 * Unified file addition helper - replaces addFiles/addProcessedFiles/addStoredFiles
 */
export async function addFiles(
  kind: AddFileKind,
  options: AddFileOptions,
  stateRef: React.MutableRefObject<FileContextState>,
  filesRef: React.MutableRefObject<Map<FileId, File>>,
  dispatch: React.Dispatch<FileContextAction>
): Promise<Array<{ file: File; id: FileId; thumbnail?: string }>> {
  const fileRecords: FileRecord[] = [];
  const addedFiles: Array<{ file: File; id: FileId; thumbnail?: string }> = [];
  
  // Build quickKey lookup from existing files for deduplication
  const existingQuickKeys = buildQuickKeySet(stateRef.current.files.byId);
  
  switch (kind) {
    case 'raw': {
      const { files = [] } = options;
      if (DEBUG) console.log(`📄 addFiles(raw): Adding ${files.length} files with immediate thumbnail generation`);
      
      for (const file of files) {
        const quickKey = createQuickKey(file);
        
        // Soft deduplication: Check if file already exists by metadata
        if (existingQuickKeys.has(quickKey)) {
          if (DEBUG) console.log(`📄 Skipping duplicate file: ${file.name} (already exists)`);
          continue;
        }
        
        const fileId = createFileId();
        filesRef.current.set(fileId, file);
        
        // Generate thumbnail and page count immediately
        let thumbnail: string | undefined;
        let pageCount: number = 1;
        
        try {
          if (DEBUG) console.log(`📄 Generating immediate thumbnail and metadata for ${file.name}`);
          const result = await generateThumbnailWithMetadata(file);
          thumbnail = result.thumbnail;
          pageCount = result.pageCount;
          if (DEBUG) console.log(`📄 Generated immediate metadata for ${file.name}: ${pageCount} pages, thumbnail: ${!!thumbnail}`);
        } catch (error) {
          if (DEBUG) console.warn(`📄 Failed to generate immediate metadata for ${file.name}:`, error);
        }
        
        // Create record with immediate thumbnail and page metadata
        const record = toFileRecord(file, fileId);
        if (thumbnail) {
          record.thumbnailUrl = thumbnail;
        }
        
        // Create initial processedFile metadata with page count
        if (pageCount > 0) {
          record.processedFile = createProcessedFile(pageCount, thumbnail);
          if (DEBUG) console.log(`📄 addFiles(raw): Created initial processedFile metadata for ${file.name} with ${pageCount} pages`);
        }
        
        existingQuickKeys.add(quickKey);
        fileRecords.push(record);
        addedFiles.push({ file, id: fileId, thumbnail });
        
        // Start background processing for validation only (we already have thumbnail and page count)
        fileProcessingService.processFile(file, fileId).then(result => {
          // Only update if file still exists in context
          if (filesRef.current.has(fileId)) {
            if (result.success && result.metadata) {
              // Only log if page count differs from our immediate calculation
              const initialPageCount = pageCount;
              if (result.metadata.totalPages !== initialPageCount) {
                if (DEBUG) console.log(`📄 Background processing found different page count for ${file.name}: ${result.metadata.totalPages} vs immediate ${initialPageCount}`);
              }
            }
          }
        });
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
          if (DEBUG) console.log(`📄 Skipping duplicate stored file: ${file.name}`);
          continue;
        }
        
        // Try to preserve original ID, but generate new if it conflicts
        let fileId = originalId;
        if (filesRef.current.has(originalId)) {
          fileId = createFileId();
          if (DEBUG) console.log(`📄 ID conflict for stored file ${file.name}, using new ID: ${fileId}`);
        }
        
        filesRef.current.set(fileId, file);
        
        const record = toFileRecord(file, fileId);
        
        // Restore metadata from storage
        if (metadata.thumbnail) {
          record.thumbnailUrl = metadata.thumbnail;
        }
        
        // Note: For stored files, processedFile will be restored from FileRecord if it exists
        // The metadata here is just basic file info, not processed file data
        
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
): Promise<void> {
  if (DEBUG) console.log(`📄 consumeFiles: Processing ${inputFileIds.length} input files, ${outputFiles.length} output files`);
  
  // Process output files through the 'processed' path to generate thumbnails
  const outputFileRecords = await Promise.all(
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
      
      return record;
    })
  );
  
  // Dispatch the consume action
  dispatch({ 
    type: 'CONSUME_FILES', 
    payload: { 
      inputFileIds, 
      outputFileRecords 
    } 
  });
  
  if (DEBUG) console.log(`📄 consumeFiles: Successfully consumed files - removed ${inputFileIds.length} inputs, added ${outputFileRecords.length} outputs`);
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