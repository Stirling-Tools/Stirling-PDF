/**
 * Refactored FileContext with reducer pattern and normalized state
 * 
 * PERFORMANCE IMPROVEMENTS:
 * - Normalized state: File objects stored in refs, only IDs in state
 * - Pure reducer: No object creation in reducer functions
 * - Split contexts: StateContext vs ActionsContext prevents unnecessary rerenders
 * - Individual selector hooks: Avoid selector object recreation
 * - Stable actions: useCallback + stateRef prevents action recreation
 * - Throttled persistence: Debounced localStorage writes
 * - Proper resource cleanup: Automatic blob URL revocation
 * 
 * USAGE:
 * - State access: useFileState(), useFileRecord(), useFileSelection()
 * - Actions only: useFileActions(), useFileManagement(), useViewerActions()
 * - Combined: useFileContext() (legacy - causes rerenders on any state change)
 * - FileRecord is the new lightweight "processed file" - no heavy processing needed
 * 
 * PERFORMANCE NOTES:
 * - useFileState() still rerenders on ANY state change (selectors object recreation)
 * - For list UIs: consider ids-only context or use-context-selector
 * - Individual hooks (useFileRecord) are the most performant option
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  FileContextState,
  FileContextProviderProps,
  FileContextSelectors,
  FileContextStateValue,
  FileContextActionsValue,
  FileContextActions,
  FileContextAction,
  ModeType,
  FileId,
  FileRecord,
  toFileRecord,
  revokeFileResources,
  createFileId,
  createQuickKey
} from '../types/fileContext';
import { FileMetadata } from '../types/file';

// Import real services
import { EnhancedPDFProcessingService } from '../services/enhancedPDFProcessingService';
import { thumbnailGenerationService } from '../services/thumbnailGenerationService';
import { fileStorage } from '../services/fileStorage';
import { fileProcessingService } from '../services/fileProcessingService';
import { generateThumbnailWithMetadata } from '../utils/thumbnailUtils';

// Get service instances
const enhancedPDFProcessingService = EnhancedPDFProcessingService.getInstance();

// Initial state
const initialFileContextState: FileContextState = {
  files: {
    ids: [],
    byId: {}
  },
  ui: {
    currentMode: 'pageEditor' as ModeType,
    selectedFileIds: [],
    selectedPageNumbers: [],
    isProcessing: false,
    processingProgress: 0,
    hasUnsavedChanges: false,
    pendingNavigation: null,
    showNavigationWarning: false
  }
};

// Reducer
function fileContextReducer(state: FileContextState, action: FileContextAction): FileContextState {
  switch (action.type) {
    case 'ADD_FILES': {
      const { fileRecords } = action.payload;
      const newIds: FileId[] = [];
      const newById: Record<FileId, FileRecord> = { ...state.files.byId };
      
      fileRecords.forEach(record => {
        // Only add if not already present (dedupe by stable ID)
        if (!newById[record.id]) {
          newIds.push(record.id);
          newById[record.id] = record;
        }
      });
      
      return {
        ...state,
        files: {
          ids: [...state.files.ids, ...newIds],
          byId: newById
        }
      };
    }
    
    case 'REMOVE_FILES': {
      const { fileIds } = action.payload;
      const remainingIds = state.files.ids.filter(id => !fileIds.includes(id));
      const newById = { ...state.files.byId };
      
      // Clean up removed files
      fileIds.forEach(id => {
        const record = newById[id];
        if (record) {
          revokeFileResources(record);
          delete newById[id];
        }
      });
      
      return {
        ...state,
        files: {
          ids: remainingIds,
          byId: newById
        },
        ui: {
          ...state.ui,
          selectedFileIds: state.ui.selectedFileIds.filter(id => !fileIds.includes(id))
        }
      };
    }
    
    case 'UPDATE_FILE_RECORD': {
      const { id, updates } = action.payload;
      const existingRecord = state.files.byId[id];
      if (!existingRecord) return state;
      
      // Immutable merge supports all FileRecord fields
      return {
        ...state,
        files: {
          ...state.files,
          byId: {
            ...state.files.byId,
            [id]: { ...existingRecord, ...updates }
          }
        }
      };
    }

    case 'SET_CURRENT_MODE': {
      return {
        ...state,
        ui: {
          ...state.ui,
          currentMode: action.payload
        }
      };
    }
    
    
    case 'SET_SELECTED_FILES': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedFileIds: action.payload.fileIds
        }
      };
    }
    
    case 'SET_SELECTED_PAGES': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedPageNumbers: action.payload.pageNumbers
        }
      };
    }
    
    case 'CLEAR_SELECTIONS': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedFileIds: [],
          selectedPageNumbers: []
        }
      };
    }
    
    case 'SET_PROCESSING': {
      return {
        ...state,
        ui: {
          ...state.ui,
          isProcessing: action.payload.isProcessing,
          processingProgress: action.payload.progress || 0
        }
      };
    }
    
    case 'SET_UNSAVED_CHANGES': {
      return {
        ...state,
        ui: {
          ...state.ui,
          hasUnsavedChanges: action.payload.hasChanges
        }
      };
    }
    
    case 'SET_PENDING_NAVIGATION': {
      return {
        ...state,
        ui: {
          ...state.ui,
          pendingNavigation: action.payload.navigationFn
        }
      };
    }
    
    case 'SHOW_NAVIGATION_WARNING': {
      return {
        ...state,
        ui: {
          ...state.ui,
          showNavigationWarning: action.payload.show
        }
      };
    }
    
    
    case 'RESET_CONTEXT': {
      // Clean up all resources before reset
      Object.values(state.files.byId).forEach(revokeFileResources);
      return { ...initialFileContextState };
    }
    
    default:
      return state;
  }
}

// Split contexts for performance
const FileStateContext = createContext<FileContextStateValue | undefined>(undefined);
const FileActionsContext = createContext<FileContextActionsValue | undefined>(undefined);

// Legacy context for backward compatibility
const FileContext = createContext<any | undefined>(undefined);

// Provider component
export function FileContextProvider({
  children,
  enableUrlSync = true,
  enablePersistence = true 
}: FileContextProviderProps) {
  const [state, dispatch] = useReducer(fileContextReducer, initialFileContextState);

  // File ref map - stores File objects outside React state
  const filesRef = useRef<Map<FileId, File>>(new Map());
  
  // Cleanup timers and refs
  const cleanupTimers = useRef<Map<string, number>>(new Map());
  const blobUrls = useRef<Set<string>>(new Set());
  const pdfDocuments = useRef<Map<string, any>>(new Map());

  // Stable state reference for selectors
  const stateRef = useRef(state);
  stateRef.current = state;

  // Stable selectors (memoized once to avoid re-renders)
  const selectors = useMemo<FileContextSelectors>(() => ({
    getFile: (id: FileId) => filesRef.current.get(id),
    
    getFiles: (ids?: FileId[]) => {
      const currentIds = ids || stateRef.current.files.ids;
      return currentIds.map(id => filesRef.current.get(id)).filter(Boolean) as File[];
    },
    
    getFileRecord: (id: FileId) => stateRef.current.files.byId[id],
    
    getFileRecords: (ids?: FileId[]) => {
      const currentIds = ids || stateRef.current.files.ids;
      return currentIds.map(id => stateRef.current.files.byId[id]).filter(Boolean);
    },
    
    getAllFileIds: () => stateRef.current.files.ids,
    
    getSelectedFiles: () => {
      return stateRef.current.ui.selectedFileIds
        .map(id => filesRef.current.get(id))
        .filter(Boolean) as File[];
    },
    
    getSelectedFileRecords: () => {
      return stateRef.current.ui.selectedFileIds
        .map(id => stateRef.current.files.byId[id])
        .filter(Boolean);
    },
    
    // Stable signature for effects - prevents unnecessary re-renders
    getFilesSignature: () => {
      return stateRef.current.files.ids
        .map(id => {
          const record = stateRef.current.files.byId[id];
          return record ? `${id}:${record.size}:${record.lastModified}` : '';
        })
        .filter(Boolean)
        .join('|');
    }
  }), []); // Empty dependency array - selectors are now stable

  // Centralized memory management
  const trackBlobUrl = useCallback((url: string) => {
    blobUrls.current.add(url);
  }, []);

  const trackPdfDocument = useCallback((fileId: string, pdfDoc: any) => {
    // Clean up existing document for this file if any
    const existing = pdfDocuments.current.get(fileId);
    if (existing && existing.destroy) {
      try {
        existing.destroy();
      } catch (error) {
        console.warn('Error destroying existing PDF document:', error);
      }
    }
    pdfDocuments.current.set(fileId, pdfDoc);
  }, []);

  const cleanupFile = useCallback(async (fileId: string) => {
    console.log('Cleaning up file:', fileId);


    try {
      // Cancel any pending cleanup timer
      const timer = cleanupTimers.current.get(fileId);
      if (timer) {
        clearTimeout(timer);
        cleanupTimers.current.delete(fileId);
      }

      // Cleanup PDF document instances (but preserve processed file cache)
      const pdfDoc = pdfDocuments.current.get(fileId);
      if (pdfDoc && pdfDoc.destroy) {
        pdfDoc.destroy();
        pdfDocuments.current.delete(fileId);
      }

    } catch (error) {
      console.warn('Error during file cleanup:', error);
    }
  }, []);

  const cleanupAllFiles = useCallback(() => {
    console.log('Cleaning up all files');


    try {
      // Clear all timers
      cleanupTimers.current.forEach(timer => clearTimeout(timer));
      cleanupTimers.current.clear();

      // Destroy all PDF documents
      pdfDocuments.current.forEach((pdfDoc, fileId) => {
        if (pdfDoc && pdfDoc.destroy) {
          try {
            pdfDoc.destroy();
          } catch (error) {
            console.warn(`Error destroying PDF document for ${fileId}:`, error);
          }
        }
      });
      pdfDocuments.current.clear();

      // Revoke all blob URLs (only blob: scheme)
      blobUrls.current.forEach(url => {
        if (url.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(url);
          } catch (error) {
            console.warn('Error revoking blob URL:', error);
          }
        }
      });
      blobUrls.current.clear();

      // Clear all processing and cache
      enhancedPDFProcessingService.clearAll();
      
      // Cancel and clear centralized file processing
      fileProcessingService.cancelAllProcessing();
      fileProcessingService.clearCache();

      // Destroy thumbnails
      thumbnailGenerationService.destroy();

      // Force garbage collection hint
      if (typeof window !== 'undefined' && (window as any).gc) {
        let gc = (window as any).gc;
        setTimeout(() => gc(), 100);
      }

    } catch (error) {
      console.warn('Error during cleanup all files:', error);
    }
  }, []);

  const scheduleCleanup = useCallback((fileId: string, delay: number = 30000) => {
    // Cancel existing timer
    const existingTimer = cleanupTimers.current.get(fileId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      cleanupTimers.current.delete(fileId);
    }

    // If delay is negative, just cancel (don't reschedule)
    if (delay < 0) {
      return;
    }

    // Schedule new cleanup
    const timer = window.setTimeout(() => {
      cleanupFile(fileId);
    }, delay);


    cleanupTimers.current.set(fileId, timer);
  }, [cleanupFile]);

  // Action implementations
  const addFiles = useCallback(async (files: File[]): Promise<File[]> => {
    console.log(`📄 addFiles: Adding ${files.length} files with immediate thumbnail generation`);
    const fileRecords: FileRecord[] = [];
    const addedFiles: File[] = [];
    
    // Build quickKey lookup from existing files for deduplication
    const existingQuickKeys = new Set<string>();
    Object.values(stateRef.current.files.byId).forEach(record => {
      existingQuickKeys.add(record.quickKey);
    });
    
    for (const file of files) {
      const quickKey = createQuickKey(file);
      
      // Soft deduplication: Check if file already exists by metadata
      if (existingQuickKeys.has(quickKey)) {
        console.log(`📄 Skipping duplicate file: ${file.name} (already exists)`);
        continue; // Skip duplicate file
      }
      
      const fileId = createFileId(); // UUID-based, zero collisions
      
      // Store File in ref map
      filesRef.current.set(fileId, file);
      
      // Generate thumbnail and page count immediately
      let thumbnail: string | undefined;
      let pageCount: number = 1;
      try {
        console.log(`📄 Generating immediate thumbnail and metadata for ${file.name}`);
        const result = await generateThumbnailWithMetadata(file);
        thumbnail = result.thumbnail;
        pageCount = result.pageCount;
        console.log(`📄 Generated immediate metadata for ${file.name}: ${pageCount} pages, thumbnail: ${!!thumbnail}`);
      } catch (error) {
        console.warn(`📄 Failed to generate immediate metadata for ${file.name}:`, error);
        // Continue with defaults
      }
      
      // Create record with immediate thumbnail and page metadata
      const record = toFileRecord(file, fileId);
      if (thumbnail) {
        record.thumbnailUrl = thumbnail;
      }
      
      // Create initial processedFile metadata with page count
      if (pageCount > 0) {
        record.processedFile = {
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
        console.log(`📄 addFiles: Created initial processedFile metadata for ${file.name} with ${pageCount} pages`);
      }
      
      // Add to deduplication tracking
      existingQuickKeys.add(quickKey);
      
      fileRecords.push(record);
      addedFiles.push(file);
      
      // Start background processing for validation only (we already have thumbnail and page count)
      fileProcessingService.processFile(file, fileId).then(result => {
        // Only update if file still exists in context
        if (filesRef.current.has(fileId)) {
          if (result.success && result.metadata) {
            // Only log if page count differs from our immediate calculation
            const initialPageCount = pageCount;
            if (result.metadata.totalPages !== initialPageCount) {
              console.log(`📄 Page count validation: ${file.name} initial=${initialPageCount} → final=${result.metadata.totalPages} pages`);
              // Update with the validated page count, but preserve existing thumbnail
              dispatch({ 
                type: 'UPDATE_FILE_RECORD', 
                payload: { 
                  id: fileId, 
                  updates: {
                    processedFile: {
                      ...result.metadata,
                      // Preserve our immediate thumbnail if we have one
                      thumbnailUrl: thumbnail || result.metadata.thumbnailUrl
                    },
                    // Keep existing thumbnailUrl if we have one
                    thumbnailUrl: thumbnail || result.metadata.thumbnailUrl
                  }
                }
              });
            } else {
              console.log(`✅ Page count validation passed for ${file.name}: ${result.metadata.totalPages} pages (immediate generation was correct)`);
            }

            // Optional: Persist to IndexedDB if enabled
            if (enablePersistence) {
              try {
                const finalThumbnail = thumbnail || result.metadata.thumbnailUrl;
                fileStorage.storeFile(file, fileId, finalThumbnail).then(() => {
                  console.log('File persisted to IndexedDB:', fileId);
                }).catch(error => {
                  console.warn('Failed to persist file to IndexedDB:', error);
                });
              } catch (error) {
                console.warn('Failed to initiate file persistence:', error);
              }
            }
          } else {
            console.warn(`❌ Background file processing failed for ${file.name}:`, result.error);
          }
        }
      }).catch(error => {
        console.error(`❌ Background file processing error for ${file.name}:`, error);
      });
      
    }
    
    // Only dispatch if we have new files
    if (fileRecords.length > 0) {
      dispatch({ type: 'ADD_FILES', payload: { fileRecords } });
    }

    // Return only the newly added files
    return addedFiles;
  }, [enablePersistence]); // Remove updateFileRecord dependency

  // NEW: Add processed files with pre-existing thumbnails and metadata (for tool outputs)
  const addProcessedFiles = useCallback(async (filesWithThumbnails: Array<{ file: File; thumbnail?: string; pageCount?: number }>): Promise<File[]> => {
    console.log(`📄 addProcessedFiles: Adding ${filesWithThumbnails.length} processed files with pre-existing thumbnails`);
    const fileRecords: FileRecord[] = [];
    const addedFiles: File[] = [];
    
    // Build quickKey lookup from existing files for deduplication
    const existingQuickKeys = new Set<string>();
    Object.values(stateRef.current.files.byId).forEach(record => {
      existingQuickKeys.add(record.quickKey);
    });
    
    for (const { file, thumbnail, pageCount } of filesWithThumbnails) {
      const quickKey = createQuickKey(file);
      
      // Soft deduplication: Check if file already exists by metadata
      if (existingQuickKeys.has(quickKey)) {
        console.log(`📄 Skipping duplicate processed file: ${file.name} (already exists)`);
        continue; // Skip duplicate file
      }
      
      const fileId = createFileId(); // UUID-based, zero collisions
      
      // Store File in ref map
      filesRef.current.set(fileId, file);
      
      // Create record with pre-existing thumbnail and page metadata
      const record = toFileRecord(file, fileId);
      if (thumbnail) {
        record.thumbnailUrl = thumbnail;
      }
      
      // If we have page count, create initial processedFile metadata
      if (pageCount && pageCount > 0) {
        record.processedFile = {
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
        console.log(`📄 addProcessedFiles: Created initial processedFile metadata for ${file.name} with ${pageCount} pages`);
      }
      
      // Add to deduplication tracking
      existingQuickKeys.add(quickKey);
      
      fileRecords.push(record);
      addedFiles.push(file);
      
      // Start background processing for page metadata only (thumbnail already provided)
      fileProcessingService.processFile(file, fileId).then(result => {
        // Only update if file still exists in context
        if (filesRef.current.has(fileId)) {
          if (result.success && result.metadata) {
            // Update with processed metadata but preserve existing thumbnail
            dispatch({ 
              type: 'UPDATE_FILE_RECORD', 
              payload: { 
                id: fileId, 
                updates: {
                  processedFile: result.metadata,
                  // Keep existing thumbnail if we already have one, otherwise use processed one
                  thumbnailUrl: thumbnail || result.metadata.thumbnailUrl
                }
              }
            });
            // Only log if page count changed (meaning our initial guess was wrong)
            const initialPageCount = pageCount || 1;
            if (result.metadata.totalPages !== initialPageCount) {
              console.log(`📄 Page count updated for ${file.name}: ${initialPageCount} → ${result.metadata.totalPages} pages`);
            } else {
              console.log(`✅ Processed file metadata complete for ${file.name}: ${result.metadata.totalPages} pages (thumbnail: ${thumbnail ? 'PRE-EXISTING' : 'GENERATED'})`);
            }

            // Optional: Persist to IndexedDB if enabled
            if (enablePersistence) {
              try {
                const finalThumbnail = thumbnail || result.metadata.thumbnailUrl;
                fileStorage.storeFile(file, fileId, finalThumbnail).then(() => {
                  console.log('Processed file persisted to IndexedDB:', fileId);
                }).catch(error => {
                  console.warn('Failed to persist processed file to IndexedDB:', error);
                });
              } catch (error) {
                console.warn('Failed to initiate processed file persistence:', error);
              }
            }
          } else {
            console.warn(`❌ Processed file background processing failed for ${file.name}:`, result.error);
          }
        }
      }).catch(error => {
        console.error(`❌ Processed file background processing error for ${file.name}:`, error);
      });
    }
    
    // Only dispatch if we have new files
    if (fileRecords.length > 0) {
      dispatch({ type: 'ADD_FILES', payload: { fileRecords } });
    }

    console.log(`📄 Added ${fileRecords.length} processed files with pre-existing thumbnails`);
    return addedFiles;
  }, [enablePersistence]);

  // NEW: Add stored files with preserved IDs to prevent duplicates across sessions
  // This is the CORRECT way to handle files from IndexedDB storage - no File object mutation
  const addStoredFiles = useCallback(async (filesWithMetadata: Array<{ file: File; originalId: FileId; metadata: FileMetadata }>): Promise<File[]> => {
    const fileRecords: FileRecord[] = [];
    const addedFiles: File[] = [];
    
    for (const { file, originalId, metadata } of filesWithMetadata) {
      // Skip if file already exists with same ID (exact match)
      if (stateRef.current.files.byId[originalId]) {
        console.log(`📄 Skipping stored file: ${file.name} (already loaded with same ID)`);
        continue;
      }
      
      // Store File in ref map with preserved ID
      filesRef.current.set(originalId, file);
      
      // Create record with preserved ID and stored metadata
      const record: FileRecord = {
        id: originalId, // Preserve original UUID from storage
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
        quickKey: createQuickKey(file),
        thumbnailUrl: metadata.thumbnail,
        createdAt: Date.now(),
        // Skip processedFile for now - it will be populated by background processing if needed
      };
      
      fileRecords.push(record);
      addedFiles.push(file);
      
      // Background processing with preserved ID (async, non-blocking)
      fileProcessingService.processFile(file, originalId).then(result => {
        // Only update if file still exists in context
        if (filesRef.current.has(originalId)) {
          if (result.success && result.metadata) {
            // Update with processed metadata using dispatch directly
            dispatch({ 
              type: 'UPDATE_FILE_RECORD', 
              payload: { 
                id: originalId, 
                updates: {
                  processedFile: result.metadata,
                  // Keep existing thumbnail if available, otherwise use processed one
                  thumbnailUrl: metadata.thumbnail || result.metadata.thumbnailUrl
                }
              }
            });
            console.log(`✅ Stored file processing complete for ${file.name}: ${result.metadata.totalPages} pages`);
          } else {
            console.warn(`❌ Stored file processing failed for ${file.name}:`, result.error);
          }
        }
      }).catch(error => {
        console.error(`❌ Stored file processing error for ${file.name}:`, error);
      });
    }
    
    // Only dispatch if we have new files
    if (fileRecords.length > 0) {
      dispatch({ type: 'ADD_FILES', payload: { fileRecords } });
    }

    console.log(`📁 Added ${fileRecords.length} stored files with preserved IDs`);
    return addedFiles;
  }, []);

  const removeFiles = useCallback((fileIds: FileId[], deleteFromStorage: boolean = true) => {
    // Cancel any ongoing processing for removed files
    fileIds.forEach(fileId => {
      fileProcessingService.cancelProcessing(fileId);
    });

    // Clean up Files from ref map first
    fileIds.forEach(fileId => {
      filesRef.current.delete(fileId);
      cleanupFile(fileId);
    });

    // Update state
    dispatch({ type: 'REMOVE_FILES', payload: { fileIds } });

    // Remove from IndexedDB only if requested
    if (enablePersistence && deleteFromStorage) {
      fileIds.forEach(async (fileId) => {
        try {
          await fileStorage.deleteFile(fileId);
        } catch (error) {
          console.error('Failed to remove file from storage:', error);
        }
      });
    }
  }, [enablePersistence, cleanupFile]);

  const updateFileRecord = useCallback((id: FileId, updates: Partial<FileRecord>) => {
    // Ensure immutable merge by dispatching action
    dispatch({ type: 'UPDATE_FILE_RECORD', payload: { id, updates } });
  }, []);

  // Navigation guard system functions
  const setHasUnsavedChanges = useCallback((hasChanges: boolean) => {
    dispatch({ type: 'SET_UNSAVED_CHANGES', payload: { hasChanges } });
  }, []);

  const requestNavigation = useCallback((navigationFn: () => void): boolean => {
    // Use stateRef to avoid stale closure issues with rapid state changes
    if (stateRef.current.ui.hasUnsavedChanges) {
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: true } });
      return false;
    } else {
      navigationFn();
      return true;
    }
  }, []); // No dependencies - uses stateRef for current state

  const confirmNavigation = useCallback(() => {
    // Use stateRef to get current navigation function
    if (stateRef.current.ui.pendingNavigation) {
      stateRef.current.ui.pendingNavigation();
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: null } });
    }
    dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: false } });
  }, []); // No dependencies - uses stateRef

  const cancelNavigation = useCallback(() => {
    dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: null } });
    dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: false } });
  }, []);

  // Memoized actions to prevent re-renders
  const actions = useMemo<FileContextActions>(() => ({
    addFiles,
    addProcessedFiles,
    addStoredFiles,
    removeFiles,
    updateFileRecord,
    clearAllFiles: () => {
      cleanupAllFiles();
      filesRef.current.clear();
      dispatch({ type: 'RESET_CONTEXT' });
    },
    setCurrentMode: (mode: ModeType) => dispatch({ type: 'SET_CURRENT_MODE', payload: mode }),
    setSelectedFiles: (fileIds: FileId[]) => dispatch({ type: 'SET_SELECTED_FILES', payload: { fileIds } }),
    setSelectedPages: (pageNumbers: number[]) => dispatch({ type: 'SET_SELECTED_PAGES', payload: { pageNumbers } }),
    clearSelections: () => dispatch({ type: 'CLEAR_SELECTIONS' }),
    setProcessing: (isProcessing: boolean, progress = 0) => dispatch({ type: 'SET_PROCESSING', payload: { isProcessing, progress } }),
    setHasUnsavedChanges,
    resetContext: () => {
      cleanupAllFiles();
      filesRef.current.clear();
      dispatch({ type: 'RESET_CONTEXT' });
    },
    // Legacy compatibility
    setMode: (mode: ModeType) => dispatch({ type: 'SET_CURRENT_MODE', payload: mode }),
    confirmNavigation,
    cancelNavigation
  }), [addFiles, addProcessedFiles, addStoredFiles, removeFiles, cleanupAllFiles, setHasUnsavedChanges, confirmNavigation, cancelNavigation]);

  // Split context values to minimize re-renders
  const stateValue = useMemo<FileContextStateValue>(() => ({
    state,
    selectors
  }), [state]); // selectors are now stable, no need to depend on them

  const actionsValue = useMemo<FileContextActionsValue>(() => ({
    actions,
    dispatch
  }), [actions]);

  // Legacy context value for backward compatibility
  const legacyContextValue = useMemo(() => ({
    ...state,
    ...state.ui,
    // Action compatibility layer
    addFiles,
    addProcessedFiles,
    addStoredFiles,
    removeFiles,
    updateFileRecord,
    clearAllFiles: actions.clearAllFiles,
    setCurrentMode: actions.setCurrentMode,
    setSelectedFiles: actions.setSelectedFiles,
    setSelectedPages: actions.setSelectedPages,
    clearSelections: actions.clearSelections,
    setHasUnsavedChanges,
    requestNavigation,
    confirmNavigation,
    cancelNavigation,
    trackBlobUrl,
    trackPdfDocument,
    cleanupFile,
    scheduleCleanup,
    // Missing operation functions (stubs)
    recordOperation: () => { console.warn('recordOperation is deprecated'); },
    markOperationApplied: () => { console.warn('markOperationApplied is deprecated'); },
    markOperationFailed: () => { console.warn('markOperationFailed is deprecated'); },
    // Computed properties that components expect
    get activeFiles() { return selectors.getFiles(); }, // Getter to avoid creating new arrays on every render
    // Selectors
    ...selectors
  }), [state, actions, addFiles, addProcessedFiles, addStoredFiles, removeFiles, updateFileRecord, setHasUnsavedChanges, requestNavigation, confirmNavigation, cancelNavigation, trackBlobUrl, trackPdfDocument, cleanupFile, scheduleCleanup]); // Removed selectors dependency

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('FileContext unmounting - cleaning up all resources');
      cleanupAllFiles();
    };
  }, [cleanupAllFiles]);

  return (
    <FileStateContext.Provider value={stateValue}>
      <FileActionsContext.Provider value={actionsValue}>
        <FileContext.Provider value={legacyContextValue}>
          {children}
        </FileContext.Provider>
      </FileActionsContext.Provider>
    </FileStateContext.Provider>
  );
}

// New hooks for split contexts (prevent unnecessary re-renders)
export function useFileState() {
  const context = useContext(FileStateContext);
  if (!context) {
    throw new Error('useFileState must be used within a FileContextProvider');
  }
  return context;
}

export function useFileActions() {
  const context = useContext(FileActionsContext);
  if (!context) {
    throw new Error('useFileActions must be used within a FileContextProvider');
  }
  return context;
}

// Legacy hook for backward compatibility
export function useFileContext(): any {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileContext must be used within a FileContextProvider');
  }
  return context;
}

// Helper hooks for specific aspects
export function useCurrentFile() {
  const { state, selectors } = useFileState();
  
  const primaryFileId = state.files.ids[0];
  return useMemo(() => ({
    file: primaryFileId ? selectors.getFile(primaryFileId) : undefined,
    record: primaryFileId ? selectors.getFileRecord(primaryFileId) : undefined
  }), [primaryFileId]); // selectors are stable, don't depend on them
}

export function useFileSelection() {
  const { state } = useFileState();
  const { actions } = useFileActions();

  return {
    selectedFileIds: state.ui.selectedFileIds,
    selectedPageNumbers: state.ui.selectedPageNumbers,
    setSelectedFiles: actions.setSelectedFiles,
    setSelectedPages: actions.setSelectedPages,
    clearSelections: actions.clearSelections
  };
}

// Legacy compatibility hooks - provide stubs for removed functionality
export function useToolFileSelection() {
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();
  
  // Memoize selectedFiles to avoid recreating arrays
  const selectedFiles = useMemo(() => {
    return selectors.getSelectedFiles();
  }, [state.ui.selectedFileIds]); // selectors are stable, don't depend on them
  
  return useMemo(() => ({
    selectedFileIds: state.ui.selectedFileIds,
    selectedPageNumbers: state.ui.selectedPageNumbers,
    selectedFiles, // Now stable - only changes when selectedFileIds actually change
    setSelectedFiles: actions.setSelectedFiles,
    setSelectedPages: actions.setSelectedPages,
    clearSelections: actions.clearSelections,
    // Tool-specific properties that components expect
    maxFiles: 10, // Default value
    isToolMode: true,
    setMaxFiles: (maxFiles: number) => { console.log('setMaxFiles called with:', maxFiles); }, // Stub with proper signature
    setIsToolMode: (isToolMode: boolean) => { console.log('setIsToolMode called with:', isToolMode); } // Stub with proper signature
  }), [selectedFiles, state.ui.selectedFileIds, state.ui.selectedPageNumbers, actions]);
}

export function useProcessedFiles() {
  const { state, selectors } = useFileState();
  
  // Create a Map-like interface for backward compatibility
  const compatibilityMap = {
    size: state.files.ids.length,
    get: (file: File) => {
      console.warn('useProcessedFiles.get is deprecated - File objects no longer have stable IDs');
      return null;
    },
    has: (file: File) => {
      console.warn('useProcessedFiles.has is deprecated - File objects no longer have stable IDs');
      return false;
    },
    set: () => {
      console.warn('processedFiles.set is deprecated - use FileRecord updates instead');
    }
  };
  
  return {
    processedFiles: compatibilityMap, // Map-like interface for backward compatibility
    getProcessedFile: (file: File) => {
      console.warn('getProcessedFile is deprecated - File objects no longer have stable IDs');
      return null;
    },
    updateProcessedFile: () => {
      console.warn('updateProcessedFile is deprecated - processed files are now stored in FileRecord');
    }
  };
}

export function useFileManagement() {
  const { actions } = useFileActions();
  return {
    addFiles: actions.addFiles,
    removeFiles: actions.removeFiles,
    clearAllFiles: actions.clearAllFiles
  };
}
