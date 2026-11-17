import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { StructureElementEdit } from "@editor/tools/pdfTextEditor/model/PageStructure";
import type { StructureType } from "@editor/tools/pdfTextEditor/model/structureTypes";

/**
 * Retag the whole block the content `mcid` marks belongs to as `type`, or
 * drop the session's retag with null. Held on the document and written by the
 * save pass as the element's /S; the page content keeps its marks, so it is
 * never regenerated. A figure or formula retagged as anything else loses its
 * description, which would otherwise replace the text a reader speaks.
 */
export class RetagBlockCommand implements Command {
  readonly type = "retag-block";
  private readonly pageIndex: number;
  private readonly mcid: number;
  private readonly to: StructureType | null;
  private previous: StructureType | null | undefined;
  /** The element's edit before its description was dropped; undefined when it was not. */
  private described: StructureElementEdit | null | undefined;

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
    if (doc.cannotRetagAs(this.pageIndex, this.mcid, this.to)) {
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
    const hadDescription =
      structure.cannotDescribe(this.mcid) === null &&
      structure.alt(this.mcid) !== null;
    const edit = structure.editFor(this.mcid);
    doc.setRetag(this.pageIndex, this.mcid, this.to);
    if (hadDescription && structure.cannotDescribe(this.mcid) !== null) {
      this.described = edit;
      structure.clearAlt(this.mcid);
    }
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    doc.setRetag(this.pageIndex, this.mcid, this.previous);
    if (this.described !== undefined) {
      doc.structure(this.pageIndex).setEdit(this.mcid, this.described);
      this.described = undefined;
    }
    doc.page(this.pageIndex).bumpRevision();
  }
}
