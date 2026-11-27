import type { Command } from "@editor/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { BLACK } from "@editor/tools/pdfTextEditor/model/Color";
import type { RGBA } from "@editor/tools/pdfTextEditor/types";
import { writeUtf16 } from "@editor/services/pdfiumService";
import {
  counterPageRotation,
  rotateObjectAbout,
  sanitizeForBase14,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { emitFallbackTextObject } from "@editor/tools/pdfTextEditor/util/fallbackFont";

const DEFAULT_FAMILY = "Helvetica";
const DEFAULT_SIZE = 12;

// Create a brand-new text object on the given page at the given page-space
// point.
export class InsertTextCommand implements Command {
  readonly type = "insert-text";
  private readonly pageIndex: number;
  private readonly x: number;
  private readonly y: number;
  private readonly text: string;
  private readonly placeholder: boolean;
  private readonly family: string;
  private readonly size: number;
  private readonly fill: RGBA;
  private createdRunId: string | null;
  private createdObjPtr: number;

  constructor(opts: {
    pageIndex: number;
    x: number;
    y: number;
    text?: string;
    placeholder?: boolean;
    family?: string;
    fontSize?: number;
    fill?: RGBA;
  }) {
    this.pageIndex = opts.pageIndex;
    this.x = opts.x;
    this.y = opts.y;
    this.text = opts.text ?? "Text";
    this.placeholder = opts.placeholder ?? false;
    this.family = opts.family ?? DEFAULT_FAMILY;
    this.size = opts.fontSize ?? DEFAULT_SIZE;
    this.fill = opts.fill ?? BLACK;
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

    // Base-14 can only render WinAnsi.
    const sanitized = sanitizeForBase14(this.text);
    let objPtr = 0;
    if ([...this.text].length > [...sanitized].length) {
      objPtr = emitFallbackTextObject(
        doc,
        page,
        this.text,
        this.size,
        this.fill,
        this.x,
        this.y,
      );
    }
    if (!objPtr) {
      objPtr = m.FPDFPageObj_NewTextObj(doc.docPtr, this.family, this.size);
      if (!objPtr) return;
      const textPtr = writeUtf16(m, sanitized);
      try {
        m.FPDFText_SetText(objPtr, textPtr);
      } finally {
        m.pdfium.wasmExports.free(textPtr);
      }
      m.FPDFPageObj_SetFillColor(
        objPtr,
        this.fill.r,
        this.fill.g,
        this.fill.b,
        this.fill.a,
      );
      m.FPDFPageObj_Transform(objPtr, 1, 0, 0, 1, this.x, this.y);
      m.FPDFPage_InsertObject(page.pagePtr, objPtr);
    }

    // On a /Rotate page, counter-rotate the new object about its anchor so it
    // reads upright in the displayed orientation rather than landing sideways.
    const rot = counterPageRotation(page.display.rotate);
    if (rot) rotateObjectAbout(m, objPtr, this.x, this.y, rot.cos, rot.sin);
    const matrix = rot
      ? {
          a: rot.cos,
          b: rot.sin,
          c: -rot.sin,
          d: rot.cos,
          e: this.x,
          f: this.y,
        }
      : { a: 1, b: 0, c: 0, d: 1, e: this.x, f: this.y };

    // Kept across redo: later steps that edit this text find it by this id.
    const runId =
      this.createdRunId ?? `p${page.index}-new-${page.runs.length}-${objPtr}`;
    const run = new TextRun({
      id: runId,
      pageIndex: page.index,
      pdfiumObjPtr: objPtr,
      bounds: {
        x: this.x,
        y: this.y,
        width: this.text.length * this.size * 0.6,
        height: this.size * 1.2,
      },
      matrix,
      text: this.text,
      fontId: `base14:${this.family}`,
      fontSize: this.size,
      fill: { ...this.fill },
      fontSubset: false,
    });
    if (this.placeholder) run.placeholderText = this.text;
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
