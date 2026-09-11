import { useCallback, useEffect, useRef, useState } from "react";

import {
  DOMCommand,
  UndoManager,
} from "@app/components/pageEditor/commands/pageCommands";

interface UseUndoManagerStateParams {
  setHasUnsavedChanges: (dirty: boolean) => void;
  canEdit: () => boolean;
}

export const useUndoManagerState = ({
  setHasUnsavedChanges,
  canEdit,
}: UseUndoManagerStateParams) => {
  const undoManagerRef = useRef(new UndoManager());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    const undoManager = undoManagerRef.current;
    setCanUndo(undoManager.canUndo());
    setCanRedo(undoManager.canRedo());

    if (!undoManager.hasHistory()) {
      setHasUnsavedChanges(false);
    }
  }, [setHasUnsavedChanges]);

  useEffect(() => {
    undoManagerRef.current.setStateChangeCallback(updateUndoRedoState);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const executeCommandWithTracking = useCallback(
    (command: DOMCommand) => {
      if (!canEdit()) return;
      undoManagerRef.current.executeCommand(command);
      setHasUnsavedChanges(true);
    },
    [setHasUnsavedChanges, canEdit],
  );

  const handleUndo = useCallback(() => {
    if (!canEdit()) return;
    undoManagerRef.current.undo();
  }, [canEdit]);

  const handleRedo = useCallback(() => {
    if (!canEdit()) return;
    undoManagerRef.current.redo();
  }, [canEdit]);

  const clearUndoHistory = useCallback(() => {
    undoManagerRef.current.clear();
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  return {
    canUndo,
    canRedo,
    executeCommandWithTracking,
    handleUndo,
    handleRedo,
    clearUndoHistory,
  };
};

export type UseUndoManagerStateReturn = ReturnType<typeof useUndoManagerState>;
