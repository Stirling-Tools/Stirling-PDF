import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

const DEFAULT_LIMIT = 200;

/**
 * LIFO command history for undo/redo.
 *
 * - `execute(cmd, doc)` applies the command and pushes it.
 * - `undo(doc)` reverts the top of the stack and moves it to the redo stack.
 * - `redo(doc)` re-applies the top of the redo stack.
 * - Any new `execute` after an `undo` clears the redo stack (standard
 *   editor semantics).
 */
export class HistoryStack {
  private readonly undoStack: Command[];
  private readonly redoStack: Command[];
  private readonly limit: number;

  constructor(limit: number = DEFAULT_LIMIT) {
    this.undoStack = [];
    this.redoStack = [];
    this.limit = limit;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  size(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  execute(cmd: Command, doc: EditorDocument): void {
    cmd.apply(doc);
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  undo(doc: EditorDocument): Command | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.revert(doc);
    this.redoStack.push(cmd);
    return cmd;
  }

  redo(doc: EditorDocument): Command | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.apply(doc);
    this.undoStack.push(cmd);
    return cmd;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /**
   * Revert every command currently on the undo stack, in reverse order.
   * Equivalent to repeated `undo()` calls until empty. After the call
   * the redo stack contains every reverted command in original order.
   */
  undoAll(doc: import("@app/tools/pdfTextEditor/v2/model/EditorDocument").EditorDocument): number {
    let count = 0;
    while (this.undoStack.length > 0) {
      this.undo(doc);
      count += 1;
    }
    return count;
  }
}
