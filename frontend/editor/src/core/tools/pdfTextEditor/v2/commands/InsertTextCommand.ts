import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { TextRun } from "@app/tools/pdfTextEditor/v2/model/TextRun";
import { BLACK } from "@app/tools/pdfTextEditor/v2/model/Color";
import { writeUtf16 } from "@app/services/pdfiumService";
import { sanitizeForBase14 } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import { emitFallbackTextObject } from "@app/tools/pdfTextEditor/v2/util/fallbackFont";

const DEFAULT_FAMILY = "Helvetica";
const DEFAULT_SIZE = 12;

/**
 * Create a brand-new text object on the given page at the given page-space
 * point. Uses the base-14 Helvetica font so the text supports any Latin
 * character without bundling.
 *
 * The created `TextRun` is appended to the page's runs list and the new
 * PDFium object is inserted into the page's content stream.
 */
export class InsertTextCommand implements Command {
  readonly type = "insert-text";
  private readonly pageIndex: number;
  private readonly x: number;
  private readonly y: number;
  private readonly text: string;
  private createdRunId: string | null;
  private createdObjPtr: number;

  constructor(opts: {
    pageIndex: number;
    x: number;
    y: number;
    text?: string;
  }) {
    this.pageIndex = opts.pageIndex;
    this.x = opts.x;
    this.y = opts.y;
    this.text = opts.text ?? "Text";
    this.createdRunId = null;
    this.createdObjPtr = 0;
  }

  /** Returns the id of the run this command created, after apply. */
  get insertedRunId(): string | null {
    return this.createdRunId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const m = doc.module;

    // Base-14 (WinAnsi) can't render >U+00FF. For text with non-Latin code
    // points, embed the bundled Unicode fallback font (Noto Sans) so they're
    // kept instead of dropped; otherwise use base-14 Helvetica. Pure-Latin
    // text takes the unchanged base-14 path.
    const sanitized = sanitizeForBase14(this.text);
    let objPtr = 0;
    if ([...this.text].length > [...sanitized].length) {
      objPtr = emitFallbackTextObject(
        doc,
        page,
        this.text,
        DEFAULT_SIZE,
        BLACK,
        this.x,
        this.y,
      );
    }
    if (!objPtr) {
      objPtr = m.FPDFPageObj_NewTextObj(
        doc.docPtr,
        DEFAULT_FAMILY,
        DEFAULT_SIZE,
      );
      if (!objPtr) return;
      const textPtr = writeUtf16(m, sanitized);
      try {
        m.FPDFText_SetText(objPtr, textPtr);
      } finally {
        m.pdfium.wasmExports.free(textPtr);
      }
      m.FPDFPageObj_SetFillColor(objPtr, BLACK.r, BLACK.g, BLACK.b, BLACK.a);
      m.FPDFPageObj_Transform(objPtr, 1, 0, 0, 1, this.x, this.y);
      m.FPDFPage_InsertObject(page.pagePtr, objPtr);
    }

    const runId = `p${page.index}-new-${page.runs.length}-${objPtr}`;
    const run = new TextRun({
      id: runId,
      pageIndex: page.index,
      pdfiumObjPtr: objPtr,
      bounds: {
        x: this.x,
        y: this.y,
        width: this.text.length * DEFAULT_SIZE * 0.6,
        height: DEFAULT_SIZE * 1.2,
      },
      matrix: { a: 1, b: 0, c: 0, d: 1, e: this.x, f: this.y },
      text: this.text,
      fontId: `base14:${DEFAULT_FAMILY}`,
      fontSize: DEFAULT_SIZE,
      fill: { ...BLACK },
      fontSubset: false,
    });
    page.setRuns([...page.runs, run]);
    page.markDirty();
    page.markNeedsGenerate();

    this.createdRunId = runId;
    this.createdObjPtr = objPtr;
  }

  revert(doc: EditorDocument): void {
    if (!this.createdObjPtr) return;
    const page = doc.page(this.pageIndex);
    doc.module.FPDFPage_RemoveObject(page.pagePtr, this.createdObjPtr);
    if (this.createdRunId) {
      page.setRuns(page.runs.filter((r) => r.id !== this.createdRunId));
    }
    page.markDirty();
    page.markNeedsGenerate();
  }
}
