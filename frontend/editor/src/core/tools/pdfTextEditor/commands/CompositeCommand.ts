import {
  RolledBackError,
  type Command,
} from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

/** Groups several already-applied commands into one undo/redo step. */
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
    this.run(doc, this.commands, "apply");
  }

  revert(doc: EditorDocument): void {
    const reversed = [...this.commands].reverse();
    this.run(doc, reversed, "revert");
  }

  // Run every child, undoing the ones that ran if one throws. A group is ONE
  // undo step, so half of it landing would leave the model describing nothing.
  private run(
    doc: EditorDocument,
    order: Command[],
    phase: "apply" | "revert",
  ): void {
    const done: Command[] = [];
    for (const cmd of order) {
      try {
        if (phase === "apply") cmd.apply(doc);
        else cmd.revert(doc);
      } catch (err) {
        for (let i = done.length - 1; i >= 0; i--) {
          try {
            if (phase === "apply") done[i].revert(doc);
            else done[i].apply(doc);
          } catch {
            // Rollback failed too, so the document really is half-changed:
            // report unwrapped so the caller rebuilds.
            throw err;
          }
        }
        throw new RolledBackError(err);
      }
      done.push(cmd);
    }
  }

  coalesceKey(): string | null {
    return this.last.coalesceKey?.() ?? null;
  }

  describe(): string {
    return this.last.describe?.() ?? "Edit";
  }
}
