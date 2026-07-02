import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { writeUtf16 } from "@app/services/pdfiumService";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";
import { sanitizeForBase14 } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/**
 * Clone a text run at a fixed offset (default 12pt right + 12pt down)
 * so the user can quickly stamp the same text elsewhere on the page.
 *
 * The clone uses base-14 Helvetica so it never fails to render its
 * characters (the original may have been a subset font that doesn't
 * round-trip through FPDFText_SetText).
 */
const OFFSET = 12;

export class DuplicateRunCommand implements Command {
  readonly type = "duplicate-run";
  private readonly pageIndex: number;
  private readonly runId: string;
  private createdRunId: string | null;
  private createdObjPtr: number;

  constructor(opts: { pageIndex: number; runId: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.createdRunId = null;
    this.createdObjPtr = 0;
  }

  get insertedRunId(): string | null {
    return this.createdRunId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const src = page.findRun(this.runId);
    if (!src) return;
    const m = doc.module;
    const fallback = helveticaVariantFor(src.fontId);
    const newPtr = m.FPDFPageObj_NewTextObj(
      doc.docPtr,
      fallback,
      Math.max(4, src.fontSize),
    );
    if (!newPtr) return;
    // Base-14 (WinAnsi) can't render >U+00FF; sanitize so non-Latin code
    // points are dropped rather than persisted as U+00FF ydieresis tofu.
    const textPtr = writeUtf16(
      m,
      sanitizeForBase14(src.text.replace(/\r?\n/g, " ")),
    );
    try {
      m.FPDFText_SetText(newPtr, textPtr);
    } finally {
      m.pdfium.wasmExports.free(textPtr);
    }
    m.FPDFPageObj_SetFillColor(
      newPtr,
      src.fill.r,
      src.fill.g,
      src.fill.b,
      src.fill.a,
    );
    const newX = src.matrix.e + OFFSET;
    const newY = src.matrix.f - OFFSET;
    m.FPDFPageObj_Transform(newPtr, 1, 0, 0, 1, newX, newY);
    m.FPDFPage_InsertObject(page.pagePtr, newPtr);
    const id = `p${page.index}-dup-${page.runs.length}-${newPtr}`;
    const clone = new TextRun({
      id,
      pageIndex: page.index,
      pdfiumObjPtr: newPtr,
      bounds: {
        x: newX,
        y: newY,
        width: src.bounds.width,
        height: src.bounds.height,
      },
      matrix: { a: 1, b: 0, c: 0, d: 1, e: newX, f: newY },
      text: src.text,
      fontId: `base14:${fallback}`,
      fontSize: src.fontSize,
      fill: { ...src.fill },
      fontSubset: false,
    });
    page.setRuns([...page.runs, clone]);
    page.markDirty();
    page.markNeedsGenerate();
    this.createdRunId = id;
    this.createdObjPtr = newPtr;
  }

  revert(doc: EditorDocument): void {
    if (!this.createdObjPtr || !this.createdRunId) return;
    const page = doc.page(this.pageIndex);
    doc.module.FPDFPage_RemoveObject(page.pagePtr, this.createdObjPtr);
    page.setRuns(page.runs.filter((r) => r.id !== this.createdRunId));
    page.markDirty();
    page.markNeedsGenerate();
  }
}
