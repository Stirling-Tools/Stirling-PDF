import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import { CompositeCommand } from "@app/tools/pdfTextEditor/v2/commands/CompositeCommand";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

const DEFAULT_LIMIT = 200;

/**
 * Commands sharing a coalesce key that execute within this many ms of each
 * other are grouped into one undo step. contentEditable fires several `input`
 * events per logical keystroke (e.g. Enter then a letter), so without this a
 * single typed action would need several undos to reverse.
 */
const COALESCE_WINDOW_MS = 600;

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
  /** Coalesce key of the last executed command, or null if not coalescable. */
  private lastCoalesceKey: string | null = null;
  /** Timestamp (ms) of the last execute(), for the coalesce time window. */
  private lastExecuteAt = 0;

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
    const key = cmd.coalesceKey?.() ?? null;
    const now = Date.now();
    const top = this.undoStack[this.undoStack.length - 1];
    // Group with the previous command when it shares a coalesce key and ran
    // within the time window. The child was already applied above; the group
    // only re-applies / reverts as a unit.
    if (
      key !== null &&
      key === this.lastCoalesceKey &&
      top &&
      now - this.lastExecuteAt <= COALESCE_WINDOW_MS
    ) {
      if (top instanceof CompositeCommand) {
        top.push(cmd);
      } else {
        this.undoStack[this.undoStack.length - 1] = new CompositeCommand([
          top,
          cmd,
        ]);
      }
    } else {
      this.undoStack.push(cmd);
      if (this.undoStack.length > this.limit) {
        this.undoStack.shift();
      }
    }
    this.lastCoalesceKey = key;
    this.lastExecuteAt = now;
    this.redoStack.length = 0;
  }

  undo(doc: EditorDocument): Command | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    cmd.revert(doc);
    this.redoStack.push(cmd);
    // End the coalescing burst - a later edit starts a fresh undo step.
    this.lastCoalesceKey = null;
    return cmd;
  }

  redo(doc: EditorDocument): Command | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    cmd.apply(doc);
    this.undoStack.push(cmd);
    this.lastCoalesceKey = null;
    return cmd;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.lastCoalesceKey = null;
  }

  /** End the coalescing burst so the next execute starts a fresh undo step. */
  breakCoalescing(): void {
    this.lastCoalesceKey = null;
  }

  /**
   * Revert every command currently on the undo stack, in reverse order.
   * Equivalent to repeated `undo()` calls until empty. After the call
   * the redo stack contains every reverted command in original order.
   */
  undoAll(
    doc: import("@app/tools/pdfTextEditor/v2/model/EditorDocument").EditorDocument,
  ): number {
    let count = 0;
    while (this.undoStack.length > 0) {
      this.undo(doc);
      count += 1;
    }
    return count;
  }
}
