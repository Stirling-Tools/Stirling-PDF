/**
 * FileContext reducer - Pure state management for file operations
 */

import { FileId } from "@app/types/file";
import {
  FileContextState,
  FileContextAction,
  StirlingFileStub,
} from "@app/types/fileContext";

// Initial state
export const initialFileContextState: FileContextState = {
  files: {
    ids: [],
    byId: {},
  },
  pinnedFiles: new Set(),
  ui: {
    selectedFileIds: [],
    selectedPageNumbers: [],
    isProcessing: false,
    processingProgress: 0,
    hasUnsavedChanges: false,
    errorFileIds: [],
  },
};

// Helper function for consume/undo operations
function processFileSwap(
  state: FileContextState,
  filesToRemove: FileId[],
  filesToAdd: StirlingFileStub[],
): FileContextState {
  // Only remove unpinned files
  const unpinnedRemoveIds = filesToRemove.filter(
    (id) => !state.pinnedFiles.has(id),
  );
  const remainingIds = state.files.ids.filter(
    (id) => !unpinnedRemoveIds.includes(id),
  );

  // Remove unpinned files from state
  const newById = { ...state.files.byId };
  unpinnedRemoveIds.forEach((id) => {
    delete newById[id];
  });

  // Add new files
  const addedIds: FileId[] = [];
  filesToAdd.forEach((record) => {
    if (!newById[record.id]) {
      addedIds.push(record.id);
      newById[record.id] = record;
    }
  });

  // Clear selections that reference removed files and add new files to selection
  const validSelectedFileIds = state.ui.selectedFileIds.filter(
    (id) => !unpinnedRemoveIds.includes(id),
  );
  const newSelectedFileIds = [...validSelectedFileIds, ...addedIds];

  return {
    ...state,
    files: {
      ids: [...addedIds, ...remainingIds],
      byId: newById,
    },
    ui: {
      ...state.ui,
      selectedFileIds: newSelectedFileIds,
    },
  };
}

/**
 * In-place variant of {@link processFileSwap} for background enforcement: the
 * outputs take the FIRST removed input's grid position (rather than jumping to
 * the front), and the outputs are NOT auto-selected — they only inherit the
 * input's selection state, so a file that was selected stays selected in place
 * and one that wasn't stays unselected. This keeps a finished policy run from
 * yanking the file to the top of the list or pulling it into view.
 */
function processFileSwapInPlace(
  state: FileContextState,
  filesToRemove: FileId[],
  filesToAdd: StirlingFileStub[],
): FileContextState {
  const unpinnedRemoveIds = filesToRemove.filter(
    (id) => !state.pinnedFiles.has(id),
  );
  const removeSet = new Set(unpinnedRemoveIds);

  // If none of the inputs are in the workspace anymore (e.g. the user closed the
  // file after its background run started), don't re-add the outputs — they're
  // already persisted to storage. Leaving the workbench untouched is what stops a
  // finished run from re-opening a file the user has since closed.
  const inputPresent = state.files.ids.some((id) => removeSet.has(id));
  if (!inputPresent) return state;

  const newById = { ...state.files.byId };
  unpinnedRemoveIds.forEach((id) => {
    delete newById[id];
  });

  const addedIds: FileId[] = [];
  filesToAdd.forEach((record) => {
    if (!newById[record.id]) {
      addedIds.push(record.id);
      newById[record.id] = record;
    }
  });

  // Insert the outputs where the first removed input sat. Because that index is
  // the FIRST removed id, every id before it survives — so it's also the correct
  // insertion index into the inputs-removed list.
  const firstIdx = state.files.ids.findIndex((id) => removeSet.has(id));
  const withoutInputs = state.files.ids.filter((id) => !removeSet.has(id));
  const newIds =
    firstIdx === -1
      ? [...withoutInputs, ...addedIds]
      : [
          ...withoutInputs.slice(0, firstIdx),
          ...addedIds,
          ...withoutInputs.slice(firstIdx),
        ];

  // Outputs inherit the input's selection state (no auto-select).
  const inputWasSelected = filesToRemove.some((id) =>
    state.ui.selectedFileIds.includes(id),
  );
  const validSelectedFileIds = state.ui.selectedFileIds.filter(
    (id) => !removeSet.has(id),
  );
  const newSelectedFileIds = inputWasSelected
    ? [...validSelectedFileIds, ...addedIds]
    : validSelectedFileIds;

  return {
    ...state,
    files: {
      ids: newIds,
      byId: newById,
    },
    ui: {
      ...state.ui,
      selectedFileIds: newSelectedFileIds,
    },
  };
}

// Pure reducer function
export function fileContextReducer(
  state: FileContextState,
  action: FileContextAction,
): FileContextState {
  switch (action.type) {
    case "ADD_FILES": {
      const { stirlingFileStubs } = action.payload;
      const newIds: FileId[] = [];
      const newById: Record<FileId, StirlingFileStub> = { ...state.files.byId };

      stirlingFileStubs.forEach((record) => {
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
          byId: newById,
        },
      };
    }

    case "REMOVE_FILES": {
      const { fileIds } = action.payload;
      const remainingIds = state.files.ids.filter(
        (id) => !fileIds.includes(id),
      );
      const newById = { ...state.files.byId };

      // Remove files from state (resource cleanup handled by lifecycle manager)
      fileIds.forEach((id) => {
        delete newById[id];
      });

      // Clear selections that reference removed files
      const validSelectedFileIds = state.ui.selectedFileIds.filter(
        (id) => !fileIds.includes(id),
      );

      return {
        ...state,
        files: {
          ids: remainingIds,
          byId: newById,
        },
        ui: {
          ...state.ui,
          selectedFileIds: validSelectedFileIds,
        },
      };
    }

    case "UPDATE_FILE_RECORD": {
      const { id, updates } = action.payload;
      const existingRecord = state.files.byId[id];

      if (!existingRecord) {
        return state; // File doesn't exist, no-op
      }

      const updatedRecord = {
        ...existingRecord,
        ...updates,
      };

      return {
        ...state,
        files: {
          ...state.files,
          byId: {
            ...state.files.byId,
            [id]: updatedRecord,
          },
        },
      };
    }

    case "REORDER_FILES": {
      const { orderedFileIds } = action.payload;

      // Validate that all IDs exist in current state
      const validIds = orderedFileIds.filter((id) => state.files.byId[id]);

      // Reorder selected files by passed order
      const selectedFileIds = orderedFileIds.filter((id) =>
        state.ui.selectedFileIds.includes(id),
      );

      return {
        ...state,
        files: {
          ...state.files,
          ids: validIds,
        },
        ui: {
          ...state.ui,
          selectedFileIds,
        },
      };
    }

    case "SET_SELECTED_FILES": {
      const { fileIds } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedFileIds: fileIds,
        },
      };
    }

    case "SET_SELECTED_PAGES": {
      const { pageNumbers } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedPageNumbers: pageNumbers,
        },
      };
    }

    case "CLEAR_SELECTIONS": {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedFileIds: [],
          selectedPageNumbers: [],
        },
      };
    }

    case "SET_PROCESSING": {
      const { isProcessing, progress } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          isProcessing,
          processingProgress: progress,
        },
      };
    }

    case "SET_UNSAVED_CHANGES": {
      return {
        ...state,
        ui: {
          ...state.ui,
          hasUnsavedChanges: action.payload.hasChanges,
        },
      };
    }

    case "MARK_FILE_ERROR": {
      const { fileId } = action.payload;
      if (state.ui.errorFileIds.includes(fileId)) return state;
      return {
        ...state,
        ui: { ...state.ui, errorFileIds: [...state.ui.errorFileIds, fileId] },
      };
    }

    case "CLEAR_FILE_ERROR": {
      const { fileId } = action.payload;
      return {
        ...state,
        ui: {
          ...state.ui,
          errorFileIds: state.ui.errorFileIds.filter((id) => id !== fileId),
        },
      };
    }

    case "CLEAR_ALL_FILE_ERRORS": {
      return {
        ...state,
        ui: { ...state.ui, errorFileIds: [] },
      };
    }

    case "PIN_FILE": {
      const { fileId } = action.payload;
      const newPinnedFiles = new Set(state.pinnedFiles);
      newPinnedFiles.add(fileId);

      return {
        ...state,
        pinnedFiles: newPinnedFiles,
      };
    }

    case "UNPIN_FILE": {
      const { fileId } = action.payload;
      const newPinnedFiles = new Set(state.pinnedFiles);
      newPinnedFiles.delete(fileId);

      return {
        ...state,
        pinnedFiles: newPinnedFiles,
      };
    }

    case "CONSUME_FILES": {
      const { inputFileIds, outputStirlingFileStubs, silent } = action.payload;

      // Transitive provenance: the outputs derive from these inputs AND from
      // whatever those inputs themselves derived from. Accumulating the closure
      // (rather than just the immediate inputs) means a policy badge still
      // resolves after an intermediate edit has been consumed and removed —
      // e.g. redact → edit → split still marks each split part. Captured before
      // the inputs are swapped out below.
      const sourceFileIds = Array.from(
        new Set(
          inputFileIds.flatMap((id) => [
            id,
            ...(state.files.byId[id]?.sourceFileIds ?? []),
          ]),
        ),
      );

      // Carry the document's classification labels forward across the edit: any
      // tool that versions/derives a classified file keeps it in its label
      // groups instead of dropping to "Other" and waiting on a PDF re-read.
      // Inherited from the first input that has any; an output that already
      // carries its own (e.g. a fresh classify result) keeps them.
      const inheritedLabels = inputFileIds
        .map((id) => state.files.byId[id]?.classificationLabels)
        .find((labels) => labels && labels.length > 0);

      // Mark every consume output as tool-produced (the single chokepoint for
      // both versioned edits and independent artifacts like convert/split/merge)
      // and stamp its provenance. Tag here, not in processFileSwap, so
      // UNDO_CONSUME (which restores the original inputs through the same helper)
      // doesn't mislabel real uploads.
      const provenancedOutputs = outputStirlingFileStubs.map((stub) => ({
        ...stub,
        derivedFromTool: true,
        sourceFileIds,
        classificationLabels: stub.classificationLabels ?? inheritedLabels,
      }));

      // Silent (background enforcement): replace inputs in their existing grid
      // slot without auto-selecting or moving the outputs to the front, so a
      // finished policy run doesn't yank the file to the top or open it.
      if (silent) {
        return processFileSwapInPlace(state, inputFileIds, provenancedOutputs);
      }

      return processFileSwap(state, inputFileIds, provenancedOutputs);
    }

    case "UNDO_CONSUME_FILES": {
      const { inputStirlingFileStubs, outputFileIds } = action.payload;

      return processFileSwap(state, outputFileIds, inputStirlingFileStubs);
    }

    case "RESET_CONTEXT": {
      // Reset UI state to clean slate (resource cleanup handled by lifecycle manager)
      return { ...initialFileContextState };
    }

    default:
      return state;
  }
}
