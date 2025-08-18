/**
 * FileContext reducer - Pure state management for file operations
 */

import { 
  FileContextState, 
  FileContextAction, 
  FileId, 
  FileRecord
} from '../../types/fileContext';

// Initial state
export const initialFileContextState: FileContextState = {
  files: {
    ids: [],
    byId: {}
  },
  ui: {
    selectedFileIds: [],
    selectedPageNumbers: [],
    isProcessing: false,
    processingProgress: 0,
    hasUnsavedChanges: false
  }
};

// Pure reducer function
export function fileContextReducer(state: FileContextState, action: FileContextAction): FileContextState {
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
      
      // Remove files from state (resource cleanup handled by lifecycle manager)
      fileIds.forEach(id => {
        delete newById[id];
      });
      
      // Clear selections that reference removed files
      const validSelectedFileIds = state.ui.selectedFileIds.filter(id => !fileIds.includes(id));
      
      return {
        ...state,
        files: {
          ids: remainingIds,
          byId: newById
        },
        ui: {
          ...state.ui,
          selectedFileIds: validSelectedFileIds
        }
      };
    }
    
    case 'UPDATE_FILE_RECORD': {
      const { id, updates } = action.payload;
      const existingRecord = state.files.byId[id];
      
      if (!existingRecord) {
        return state; // File doesn't exist, no-op
      }
      
      return {
        ...state,
        files: {
          ...state.files,
          byId: {
            ...state.files.byId,
            [id]: {
              ...existingRecord,
              ...updates
            }
          }
        }
      };
    }
    
    case 'SET_SELECTED_FILES': {
      const { fileIds } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedFileIds: fileIds
        }
      };
    }
    
    case 'SET_SELECTED_PAGES': {
      const { pageNumbers } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedPageNumbers: pageNumbers
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
      const { isProcessing, progress } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          isProcessing,
          processingProgress: progress
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
    
    case 'RESET_CONTEXT': {
      // Reset UI state to clean slate (resource cleanup handled by lifecycle manager)
      return { ...initialFileContextState };
    }
    
    default:
      return state;
  }
}