import i18n from "i18next";
import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  StructureRole,
  StructureType,
} from "@editor/tools/pdfTextEditor/model/structureTypes";

/**
 * Retag element `key`, one marking part of a block's text, or remove it with
 * null, its text read as its block's again. Held on the page's structure and
 * written by the save; the page content keeps its marks.
 */
export class RetagInnerCommand implements Command {
  readonly type = "retag-inner";
  private readonly pageIndex: number;
  private readonly key: string;
  private readonly to: StructureType | null;
  private previous: StructureRole | null | undefined;

  constructor(opts: {
    pageIndex: number;
    key: string;
    type: StructureType | null;
  }) {
    this.pageIndex = opts.pageIndex;
    this.key = opts.key;
    this.to = opts.type;
  }

  apply(doc: EditorDocument): void {
    const structure = doc.structure(this.pageIndex);
    try {
      const previous = structure.innerType(this.key);
      structure.setInnerType(this.key, this.to);
      if (this.previous === undefined) this.previous = previous;
    } catch (err) {
      throw new RolledBackError(
        new Error(
          i18n.t(
            "pdfTextEditor.inspector.accessibility.cannotRetag",
            "This text's tag can't be changed.",
          ),
          { cause: err },
        ),
      );
    }
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    // Only an element of a standard type can be changed or removed.
    doc
      .structure(this.pageIndex)
      .setInnerType(this.key, this.previous?.type ?? null);
    doc.page(this.pageIndex).bumpRevision();
  }
}
