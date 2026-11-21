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

  includes(cmd: Command): boolean {
    return this.commands.includes(cmd);
  }

  /** The most recent child - used to derive the group's coalesce key. */
  get last(): Command {
    return this.commands[this.commands.length - 1];
  }

  /** The most recent child the user's own gesture made, passing over the follow-ups the store attaches to it. */
  get lastLead(): Command {
    for (let i = this.commands.length - 1; i >= 0; i--)
      if (!this.commands[i].followsPrevious) return this.commands[i];
    return this.last;
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
    const leads = this.commands.filter((cmd) => !cmd.followsPrevious);
    const followers = this.commands.filter((cmd) => cmd.followsPrevious);
    if (
      phase === "revert" &&
      followers.length > 0 &&
      this.canMoveGroup(doc, leads)
    ) {
      // After the group: if its undo fails and rolls back, nothing else moved.
      this.lastLead.moveGroup?.(doc, leads, phase);
      for (const follower of [...followers].reverse())
        follower.revertBesideGroup?.(doc);
      // The group's undo puts the text back but not where its format laid it.
      for (const follower of followers) follower.relayoutAfterGroup?.(doc);
      return;
    }
    if (this.lastLead.moveGroup?.(doc, leads, phase)) {
      // Lay the group's final text out as each step's follow-up did.
      for (const follower of followers) follower.relayoutAfterGroup?.(doc);
      return;
    }
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

  // Whether the leads' undo would run as one group; asked before taking any
  // follow-up back, since a follow-up undone ahead of a group that then steps
  // through one by one would leave its line moves in place.
  private canMoveGroup(doc: EditorDocument, leads: Command[]): boolean {
    return !!this.lastLead.wouldMoveGroup?.(doc, leads, "revert");
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
