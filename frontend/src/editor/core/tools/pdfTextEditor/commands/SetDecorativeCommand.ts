import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  PageStructure,
  StructureElementEdit,
} from "@editor/tools/pdfTextEditor/model/PageStructure";

/**
 * Mark or unmark the structure element owning `mcid` as decorative. Like a
 * description, the mark is held on the document's structure index and written
 * by the save pass, which turns the element's content into an artifact.
 */
export class SetDecorativeCommand implements Command {
  readonly type = "set-decorative";
  private readonly pageIndex: number;
  private readonly mcid: number;
  private readonly decorative: boolean;
  private previous: StructureElementEdit | null | undefined;

  constructor(opts: { pageIndex: number; mcid: number; decorative: boolean }) {
    this.pageIndex = opts.pageIndex;
    this.mcid = opts.mcid;
    this.decorative = opts.decorative;
  }

  apply(doc: EditorDocument): void {
    const structure = doc.structure(this.pageIndex);
    // Refused here, not at save: a mark the save cannot write would fail every
    // later save, the user's other edits included.
    if (this.refused(structure)) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotChange",
            "This image's accessibility can't be changed.",
          ),
        ),
      );
    }
    if (this.previous === undefined) {
      this.previous = structure.editFor(this.mcid);
    }
    structure.setDecorative(this.mcid, this.decorative);
    doc.page(this.pageIndex).bumpRevision();
  }

  private refused(structure: PageStructure): boolean {
    // An added figure has no element in the file to drop: TagImageCommand
    // retags its content instead.
    if (structure.isAdded(this.mcid)) return true;
    const blocker = this.decorative
      ? structure.cannotMarkDecorative(this.mcid)
      : structure.cannotDescribe(this.mcid);
    return blocker !== null;
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    doc.structure(this.pageIndex).setEdit(this.mcid, this.previous);
    doc.page(this.pageIndex).bumpRevision();
  }
}
