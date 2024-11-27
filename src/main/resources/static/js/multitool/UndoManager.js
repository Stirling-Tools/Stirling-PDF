export class UndoManager {
  _undoStack;
  _redoStack;

  constructor() {
    this._undoStack = [];
    this._redoStack = [];
  }

  pushUndo(command) {
    this._undoStack.push(command);
  }

  pushRedo(command) {
    this._redoStack.push(command);
  }

  pushUndoClearRedo(command) {
    this._undoStack.push(command);
    this._redoStack = [];
  }

  undo() {
    if (!this.canUndo()) return;

    let cmd = this._undoStack.pop();
    cmd.undo();

    this._redoStack.push(cmd);
  }

  canUndo() {
    return this._undoStack && this._undoStack.length > 0;
  }

  redo() {
    if (!this.canRedo()) return;

    let cmd = this._redoStack.pop();
    cmd.redo();

    this._undoStack.push(cmd);
  }

  canRedo() {
    return this._redoStack && this._redoStack.length > 0;
  }
}
