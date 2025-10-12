import { useState, useCallback } from 'react';

export interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

export interface CommandSequence {
  commands: Command[];
  execute(): void;
  undo(): void;
  description: string;
}

export function useUndoRedo() {
  const [undoStack, setUndoStack] = useState<(Command | CommandSequence)[]>([]);
  const [redoStack, setRedoStack] = useState<(Command | CommandSequence)[]>([]);

  const executeCommand = useCallback((command: Command | CommandSequence) => {
    command.execute();
    setUndoStack(prev => [command, ...prev]);
    setRedoStack([]); // Clear redo stack when new command is executed
  }, []);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return false;

    const command = undoStack[0];
    command.undo();
    
    setUndoStack(prev => prev.slice(1));
    setRedoStack(prev => [command, ...prev]);
    
    return true;
  }, [undoStack]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return false;

    const command = redoStack[0];
    command.execute();
    
    setRedoStack(prev => prev.slice(1));
    setUndoStack(prev => [command, ...prev]);
    
    return true;
  }, [redoStack]);

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  return {
    executeCommand,
    undo,
    redo,
    clear,
    canUndo,
    canRedo,
    undoStack,
    redoStack
  };
}