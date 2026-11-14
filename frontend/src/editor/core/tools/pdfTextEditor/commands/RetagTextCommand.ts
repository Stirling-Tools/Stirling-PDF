import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";

/**
 * Retag the whole block the text `mcid` marks belongs to as `type`, or drop
 * the session's retag with null. Held on the document and written by the save pass as the
 * element's /S; the page content keeps its marks, so it is never regenerated.
 */
export class RetagTextCommand implements Command {
  readonly type = "retag-text";
  private readonly pageIndex: number;
  private readonly mcid: number;
  private readonly to: StructureType | null;
  private previous: StructureType | null | undefined;

  constructor(opts: {
    pageIndex: number;
    mcid: number;
    type: StructureType | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.mcid = opts.mcid;
    this.to = opts.type;
  }

  apply(doc: EditorDocument): void {
    const structure = doc.structure(this.pageIndex);
    if (structure.cannotRetag(this.mcid)) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotRetag",
            "This text's tag can't be changed.",
          ),
        ),
      );
    }
    if (this.previous === undefined) {
      this.previous = structure.block(this.mcid)!.type;
    }
    doc.setRetag(this.pageIndex, this.mcid, this.to);
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    doc.setRetag(this.pageIndex, this.mcid, this.previous);
    doc.page(this.pageIndex).bumpRevision();
  }
}
