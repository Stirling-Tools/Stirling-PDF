import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Groups several already-applied commands into one undo/redo step.
 *
 * The HistoryStack uses this to coalesce a burst of keystrokes on the same
 * run (contentEditable fires several `input` events per logical action) so a
 * single undo reverts the whole burst. The child commands are applied at
 * dispatch time individually; this wrapper only re-applies (redo, in order)
 * and reverts (undo, in REVERSE order) them as a unit.
 */
export class CompositeCommand implements Command {
  readonly type = "composite";
  private readonly commands: Command[];

  constructor(commands: Command[]) {
    this.commands = commands;
  }

  /** Append another already-applied command to this group. */
  push(cmd: Command): void {
    this.commands.push(cmd);
  }

  /** The most recent child - used to derive the group's coalesce key. */
  get last(): Command {
    return this.commands[this.commands.length - 1];
  }

  apply(doc: EditorDocument): void {
    for (const cmd of this.commands) cmd.apply(doc);
  }

  revert(doc: EditorDocument): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].revert(doc);
    }
  }

  coalesceKey(): string | null {
    return this.last.coalesceKey?.() ?? null;
  }

  describe(): string {
    return this.last.describe?.() ?? "Edit";
  }
}
