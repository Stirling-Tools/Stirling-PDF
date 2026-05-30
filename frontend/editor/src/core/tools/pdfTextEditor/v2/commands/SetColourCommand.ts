import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import type { RGBA } from "@app/tools/pdfTextEditor/v2/types";
import { PdfiumTextWriter } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumTextWriter";

export class SetColourCommand implements Command {
  readonly type = "set-colour";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextFill: RGBA;
  private prevFill: RGBA | null;

  constructor(opts: { pageIndex: number; runId: string; nextFill: RGBA }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextFill = opts.nextFill;
    this.prevFill = null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    if (this.prevFill === null) {
      this.prevFill = { ...run.fill };
    }
    run.fill = { ...this.nextFill };
    run.dirty = true;
    page.markDirty();
    PdfiumTextWriter.commitRunFill(doc, page, run);
  }

  revert(doc: EditorDocument): void {
    if (this.prevFill === null) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    run.fill = { ...this.prevFill };
    run.dirty = true;
    page.markDirty();
    PdfiumTextWriter.commitRunFill(doc, page, run);
  }

  describe(): string {
    return `Set colour on ${this.runId}`;
  }
}
