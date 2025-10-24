/**
 * FileContext reducer - Pure state management for file operations
 */

import { FileId } from '../../types/file';
import {
  FileContextState,
  FileContextAction,
  StirlingFileStub
} from '../../types/fileContext';

// Initial state
export const initialFileContextState: FileContextState = {
  files: {
    ids: [],
    byId: {}
  },
  pinnedFiles: new Set(),
  ui: {
    selectedFileIds: [],
    selectedPageNumbers: [],
    isProcessing: false,
    processingProgress: 0,
    hasUnsavedChanges: false,
    errorFileIds: []
  }
};

// Helper function for consume/undo operations
function processFileSwap(
  state: FileContextState,
  filesToRemove: FileId[],
  filesToAdd: StirlingFileStub[]
): FileContextState {
  // Only remove unpinned files
  const unpinnedRemoveIds = filesToRemove.filter(id => !state.pinnedFiles.has(id));
  const remainingIds = state.files.ids.filter(id => !unpinnedRemoveIds.includes(id));

  // Remove unpinned files from state
  const newById = { ...state.files.byId };
  unpinnedRemoveIds.forEach(id => {
    delete newById[id];
  });

  // Add new files
  const addedIds: FileId[] = [];
  filesToAdd.forEach(record => {
    if (!newById[record.id]) {
      addedIds.push(record.id);
      newById[record.id] = record;
    }
  });

  // Clear selections that reference removed files and add new files to selection
  const validSelectedFileIds = state.ui.selectedFileIds.filter(id => !unpinnedRemoveIds.includes(id));
  const newSelectedFileIds = [...validSelectedFileIds, ...addedIds];

  return {
    ...state,
    files: {
      ids: [...addedIds, ...remainingIds],
      byId: newById
    },
    ui: {
      ...state.ui,
      selectedFileIds: newSelectedFileIds
    }
  };
}

// Pure reducer function
export function fileContextReducer(state: FileContextState, action: FileContextAction): FileContextState {
  switch (action.type) {
    case 'ADD_FILES': {
      const { stirlingFileStubs } = action.payload;
      const newIds: FileId[] = [];
      const newById: Record<FileId, StirlingFileStub> = { ...state.files.byId };
      let hasInsertionPosition = false;

      stirlingFileStubs.forEach(record => {
        // Only add if not already present (dedupe by stable ID)
        if (!newById[record.id]) {
          newIds.push(record.id);

          // Track if any file has an insertion position
          if (record.insertAfterPageId) {
            hasInsertionPosition = true;
          }

          // Store record WITH insertAfterPageId temporarily
          // PageEditorContext will read it and clear it
          newById[record.id] = record;
        }
      });

      // Determine final file order
      // NOTE: If files have insertAfterPageId, we just append to end
      // The page-level insertion is handled by usePageDocument
      const finalIds = [...state.files.ids, ...newIds];

      // Auto-select inserted files
      const newSelectedFileIds = hasInsertionPosition
        ? [...state.ui.selectedFileIds, ...newIds]
        : state.ui.selectedFileIds;

      return {
        ...state,
        files: {
          ids: finalIds,
          byId: newById
        },
        ui: {
          ...state.ui,
          selectedFileIds: newSelectedFileIds
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

      const updatedRecord = {
        ...existingRecord,
        ...updates
      };

      return {
        ...state,
        files: {
          ...state.files,
          byId: {
            ...state.files.byId,
            [id]: updatedRecord
          }
        }
      };
    }

    case 'REORDER_FILES': {
      const { orderedFileIds } = action.payload;

      // Validate that all IDs exist in current state
      const validIds = orderedFileIds.filter(id => state.files.byId[id]);

      // Don't touch selectedFileIds - it's just a reference list, order doesn't matter
      return {
        ...state,
        files: {
          ...state.files,
          ids: validIds
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

    case 'MARK_FILE_ERROR': {
      const { fileId } = action.payload;
      if (state.ui.errorFileIds.includes(fileId)) return state;
      return {
        ...state,
        ui: { ...state.ui, errorFileIds: [...state.ui.errorFileIds, fileId] }
      };
    }

    case 'CLEAR_FILE_ERROR': {
      const { fileId } = action.payload;
      return {
        ...state,
        ui: { ...state.ui, errorFileIds: state.ui.errorFileIds.filter(id => id !== fileId) }
      };
    }

    case 'CLEAR_ALL_FILE_ERRORS': {
      return {
        ...state,
        ui: { ...state.ui, errorFileIds: [] }
      };
    }

    case 'PIN_FILE': {
      const { fileId } = action.payload;
      const newPinnedFiles = new Set(state.pinnedFiles);
      newPinnedFiles.add(fileId);

      return {
        ...state,
        pinnedFiles: newPinnedFiles
      };
    }

    case 'UNPIN_FILE': {
      const { fileId } = action.payload;
      const newPinnedFiles = new Set(state.pinnedFiles);
      newPinnedFiles.delete(fileId);

      return {
        ...state,
        pinnedFiles: newPinnedFiles
      };
    }

    case 'CONSUME_FILES': {
      const { inputFileIds, outputStirlingFileStubs } = action.payload;

      return processFileSwap(state, inputFileIds, outputStirlingFileStubs);
    }


    case 'UNDO_CONSUME_FILES': {
      const { inputStirlingFileStubs, outputFileIds } = action.payload;

      return processFileSwap(state, outputFileIds, inputStirlingFileStubs);
    }

    case 'RESET_CONTEXT': {
      // Reset UI state to clean slate (resource cleanup handled by lifecycle manager)
      return { ...initialFileContextState };
    }

    default:
      return state;
  }
}
