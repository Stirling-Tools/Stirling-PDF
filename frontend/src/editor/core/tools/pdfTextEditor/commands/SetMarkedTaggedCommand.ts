import i18n from "i18next";
import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

/** Set whether the saved file declares itself tagged (EditorDocument.markedTagged). */
export class SetMarkedTaggedCommand implements Command {
  readonly type = "set-marked-tagged";
  private previous: boolean | null = null;

  constructor(private readonly marked: boolean) {}

  apply(doc: EditorDocument): void {
    this.previous ??= doc.markedTagged();
    doc.setMarkedTagged(this.marked);
  }

  revert(doc: EditorDocument): void {
    if (this.previous !== null) doc.setMarkedTagged(this.previous);
  }

  describe(): string {
    return this.marked
      ? i18n.t("pdfTextEditor.commands.markTagged", "Mark as fully tagged")
      : i18n.t(
          "pdfTextEditor.commands.unmarkTagged",
          "Mark as not fully tagged",
        );
  }
}
