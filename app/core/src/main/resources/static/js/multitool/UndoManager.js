export class UndoManager {
  _undoStack;
  _redoStack;

  constructor() {
    this._undoStack = [];
    this._redoStack = [];
  }

  pushUndo(command) {
    this._undoStack.push(command);
    this._dispatchStateChange();
  }

  pushRedo(command) {
    this._redoStack.push(command);
    this._dispatchStateChange();
  }

  pushUndoClearRedo(command) {
    this._undoStack.push(command);
    this._redoStack = [];
    this._dispatchStateChange();
  }

  undo() {
    if (!this.canUndo()) return;

    let cmd = this._undoStack.pop();
    cmd.undo();

    this._redoStack.push(cmd);
    this._dispatchStateChange();
  }

  canUndo() {
    return this._undoStack && this._undoStack.length > 0;
  }

  redo() {
    if (!this.canRedo()) return;

    let cmd = this._redoStack.pop();
    cmd.redo();

    this._undoStack.push(cmd);
    this._dispatchStateChange();
  }

  canRedo() {
    return this._redoStack && this._redoStack.length > 0;
  }

  _dispatchStateChange() {
    document.dispatchEvent(
      new CustomEvent("undo-manager-update", {
        bubbles: true,
        detail: {
          canUndo: this.canUndo(),
          canRedo: this.canRedo(),
        },
      })
    );
  }
}
