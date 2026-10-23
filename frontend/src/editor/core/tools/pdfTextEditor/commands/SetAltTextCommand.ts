import {
  RolledBackError,
  type Command,
} from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { StructureElementEdit } from "@editor/tools/pdfTextEditor/model/PageStructure";

/**
 * Set or remove the description of the structure element owning `mcid`.
 * Touches no page content: the edit is held on the document's structure index
 * and written by the save pass, so the page is never regenerated for it.
 */
export class SetAltTextCommand implements Command {
  readonly type = "set-alt-text";
  private readonly pageIndex: number;
  private readonly mcid: number;
  private readonly alt: string | null;
  private previous: StructureElementEdit | null | undefined;

  constructor(opts: { pageIndex: number; mcid: number; alt: string | null }) {
    this.pageIndex = opts.pageIndex;
    this.mcid = opts.mcid;
    this.alt = opts.alt;
  }

  apply(doc: EditorDocument): void {
    const structure = doc.structure(this.pageIndex);
    // Refused here, not at save: a description the save cannot write would
    // fail every later save, the user's other edits included.
    const refusal = structure.cannotDescribe(this.mcid);
    if (refusal) {
      throw new RolledBackError(
        new Error(`MCID ${this.mcid} cannot take a description: ${refusal}`),
      );
    }
    if (this.previous === undefined) {
      this.previous = structure.editFor(this.mcid);
    }
    structure.setEdit(this.mcid, { mcid: this.mcid, alt: this.alt });
    doc.page(this.pageIndex).bumpRevision();
  }

  revert(doc: EditorDocument): void {
    if (this.previous === undefined) return;
    doc.structure(this.pageIndex).setEdit(this.mcid, this.previous);
    doc.page(this.pageIndex).bumpRevision();
  }

  /** Keystrokes in one description field collapse into one undo step. */
  coalesceKey(): string {
    return `${this.type}:${this.pageIndex}:${this.mcid}`;
  }
}
