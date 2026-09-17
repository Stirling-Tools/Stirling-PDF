import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { BLACK } from "@app/tools/pdfTextEditor/model/Color";
import {
  counterPageRotation,
  emitTextLine,
  orderEmittedTextPieces,
  rotateObjectAbout,
  textObjectBoundsPt,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";

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
  private createdRunId: string | null;
  private createdObjPtrs: number[];

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
    this.createdObjPtrs = [];
  }

  /** Returns the id of the run this command created, after apply. */
  get insertedRunId(): string | null {
    return this.createdRunId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const m = doc.module;
    const emittedTexts: string[] = [];
    const emittedLogicalIndices: number[] = [];
    const ptrs = emitTextLine({
      doc,
      page,
      text: this.text,
      x: this.x,
      y: this.y,
      fontSize: DEFAULT_SIZE,
      fill: BLACK,
      originalFontPtr: 0,
      fallbackFamily: DEFAULT_FAMILY,
      outTexts: emittedTexts,
      outLogicalIndices: emittedLogicalIndices,
    });
    if (ptrs.length === 0) return;

    // On a /Rotate page, counter-rotate the new object about its anchor so it
    // reads upright in the displayed orientation rather than landing sideways.
    const rot = counterPageRotation(page.display.rotate);
    if (rot) {
      for (const ptr of ptrs) {
        rotateObjectAbout(m, ptr, this.x, this.y, rot.cos, rot.sin);
      }
    }
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

    const runId = `p${page.index}-new-${page.runs.length}-${ptrs[0]}`;
    const run = new TextRun({
      id: runId,
      pageIndex: page.index,
      pdfiumObjPtr: ptrs[0],
      bounds: {
        x: this.x,
        y: this.y,
        width: this.text.length * DEFAULT_SIZE * 0.6,
        height: DEFAULT_SIZE * 1.2,
      },
      matrix,
      text: this.text,
      fontId: `base14:${DEFAULT_FAMILY}`,
      fontSize: DEFAULT_SIZE,
      fill: { ...BLACK },
      fontSubset: false,
    });
    const pieces = orderEmittedTextPieces(
      ptrs,
      emittedTexts,
      emittedLogicalIndices,
    );
    run.mergedFromPtrs = pieces.map((piece) => piece.ptr);
    run.mergedFromTexts = pieces.map((piece) => piece.text);
    run.mergedFromBounds = pieces.map((piece) =>
      textObjectBoundsPt(m, piece.ptr, this.x),
    );
    run.mergedFromCharStarts = pieces.map((piece) => piece.logicalStart);
    run.paragraphMemberPtrs = [ptrs[0]];
    run.paragraphMemberFs = [this.y];
    run.paragraphLeafPtrs = [...ptrs];
    run.paragraphLeafContainers = ptrs.map(() => 0);
    page.setRuns([...page.runs, run]);
    page.markDirty();
    page.markNeedsGenerate();

    this.createdRunId = runId;
    this.createdObjPtrs = ptrs;
  }

  revert(doc: EditorDocument): void {
    if (this.createdObjPtrs.length === 0) return;
    const page = doc.page(this.pageIndex);
    for (const ptr of this.createdObjPtrs) {
      doc.module.FPDFPage_RemoveObject(page.pagePtr, ptr);
    }
    if (this.createdRunId) {
      page.setRuns(page.runs.filter((r) => r.id !== this.createdRunId));
    }
    page.markDirty();
    page.markNeedsGenerate();
  }
}
