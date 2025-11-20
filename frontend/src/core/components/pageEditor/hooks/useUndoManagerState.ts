import { useCallback, useEffect, useRef, useState } from "react";

import { UndoManager } from "@app/components/pageEditor/commands/pageCommands";

interface UseUndoManagerStateParams {
  setHasUnsavedChanges: (dirty: boolean) => void;
}

export const useUndoManagerState = ({
  setHasUnsavedChanges,
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
    (command: any) => {
      undoManagerRef.current.executeCommand(command);
      setHasUnsavedChanges(true);
    },
    [setHasUnsavedChanges]
  );

  const handleUndo = useCallback(() => {
    undoManagerRef.current.undo();
  }, []);

  const handleRedo = useCallback(() => {
    undoManagerRef.current.redo();
  }, []);

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
