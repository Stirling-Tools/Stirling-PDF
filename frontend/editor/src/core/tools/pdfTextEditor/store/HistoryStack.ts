import {
  RolledBackError,
  type Command,
} from "@app/tools/pdfTextEditor/commands/Command";
import { CompositeCommand } from "@app/tools/pdfTextEditor/commands/CompositeCommand";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

const DEFAULT_LIMIT = 200;

// Commands sharing a coalesce key that execute within this many ms of each
// other are grouped into one undo step. contentEditable fires several `input`.
const COALESCE_WINDOW_MS = 600;

/** A command threw mid-step, so the document no longer matches the history. */
export class HistoryStepError extends Error {
  readonly phase: "apply" | "revert";
  readonly cause: unknown;
  // True when the failing command put the document back as it was, so the run
  // model still describes the page and only THIS step is lost.
  readonly documentIntact: boolean;

  constructor(phase: "apply" | "revert", cause: unknown) {
    super(`Command failed to ${phase}`);
    this.name = "HistoryStepError";
    this.phase = phase;
    this.documentIntact = cause instanceof RolledBackError;
    this.cause = cause instanceof RolledBackError ? cause.cause : cause;
  }
}

// LIFO command history for undo/redo. - `execute` applies the command and
// pushes it.
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

  /** The command a plain undo would revert next (null when empty). */
  peekUndo(): Command | null {
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  execute(cmd: Command, doc: EditorDocument): void {
    // Read the clock BEFORE apply: the window is meant to measure the user's
    // idle time between edits.
    const startedAt = Date.now();
    try {
      cmd.apply(doc);
    } catch (err) {
      // Not recorded: a history entry whose apply half-ran cannot be reverted,
      // so the next undo would revert changes that were never made.
      this.lastCoalesceKey = null;
      throw new HistoryStepError("apply", err);
    }
    const key = cmd.coalesceKey?.() ?? null;
    const top = this.undoStack[this.undoStack.length - 1];
    // The command a merge would join. Unwrap a group to its most recent
    // child so the hook compares against a real edit, not the wrapper.
    const previous = (top instanceof CompositeCommand ? top.last : top) ?? null;
    // Group with the previous command when it shares a coalesce key and ran
    // within the time window.
    const inWindow =
      startedAt - this.lastExecuteAt <= COALESCE_WINDOW_MS ||
      cmd.coalesceIgnoresTimeWindow?.(previous) === true;
    if (key !== null && key === this.lastCoalesceKey && top && inWindow) {
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
    // Stamped after apply() so the next execute() measures the idle gap.
    this.lastExecuteAt = Date.now();
    this.redoStack.length = 0;
  }

  undo(doc: EditorDocument): Command | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    try {
      cmd.revert(doc);
    } catch (err) {
      // The command is already popped and the document is in an unknown
      // state, so the caller has to rebuild rather than keep undoing.
      this.lastCoalesceKey = null;
      throw new HistoryStepError("revert", err);
    }
    this.redoStack.push(cmd);
    // End the coalescing burst - a later edit starts a fresh undo step.
    this.lastCoalesceKey = null;
    return cmd;
  }

  redo(doc: EditorDocument): Command | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    try {
      cmd.apply(doc);
    } catch (err) {
      this.lastCoalesceKey = null;
      throw new HistoryStepError("apply", err);
    }
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

  /** Revert every command currently on the undo stack, in reverse order. */
  undoAll(
    doc: import("@app/tools/pdfTextEditor/model/EditorDocument").EditorDocument,
  ): number {
    let count = 0;
    while (this.undoStack.length > 0) {
      this.undo(doc);
      count += 1;
    }
    return count;
  }
}
