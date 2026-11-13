import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

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

  private run(
    doc: EditorDocument,
    order: Command[],
    phase: "apply" | "revert",
  ): void {
    if (this.last.moveGroup?.(doc, this.commands, phase)) return;
    const done: Command[] = [];
    for (const [i, cmd] of order.entries()) {
      if (!order[i + 1]?.supersedes?.(cmd)) {
        try {
          if (phase === "apply") cmd.apply(doc);
          else cmd.revert(doc);
        } catch (err) {
          for (let j = done.length - 1; j >= 0; j--) {
            try {
              if (phase === "apply") done[j].revert(doc);
              else done[j].apply(doc);
            } catch {
              throw err;
            }
          }
          throw new RolledBackError(err);
        }
      }
      done.push(cmd);
    }
  }

  coalesceKey(): string | null {
    return this.last.coalesceKey?.() ?? null;
  }

  describe(): string {
    return (
      this.last.describe?.() ?? i18n.t("pdfTextEditor.commands.edit", "Edit")
    );
  }
}
