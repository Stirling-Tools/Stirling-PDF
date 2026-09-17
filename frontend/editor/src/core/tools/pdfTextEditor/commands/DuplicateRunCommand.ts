import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import {
  emitTextLine,
  orderEmittedTextPieces,
  textObjectBoundsPt,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import {
  fallbackFamilyFor,
  fallbackFontIdFor,
} from "@app/tools/pdfTextEditor/util/fontCapability";

// Clone a text run at a fixed offset (default 12pt right + 12pt down) so the
// user can quickly stamp the same text elsewhere on the page.
const OFFSET = 12;

export class DuplicateRunCommand implements Command {
  readonly type = "duplicate-run";
  private readonly pageIndex: number;
  private readonly runId: string;
  private createdRunId: string | null;
  private createdObjPtrs: number[];

  constructor(opts: { pageIndex: number; runId: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.createdRunId = null;
    this.createdObjPtrs = [];
  }

  get insertedRunId(): string | null {
    return this.createdRunId;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const src = page.findRun(this.runId);
    if (!src) return;
    const fallback = fallbackFamilyFor(src.fontId);
    const newX = src.matrix.e + OFFSET;
    const newY = src.matrix.f - OFFSET;
    const emittedTexts: string[] = [];
    const emittedLogicalIndices: number[] = [];
    const ptrs = emitTextLine({
      doc,
      page,
      text: src.text.replace(/\r?\n/g, " "),
      x: newX,
      y: newY,
      fontSize: Math.max(4, src.fontSize),
      fill: src.fill,
      originalFontPtr: 0,
      fallbackFamily: fallback,
      outTexts: emittedTexts,
      outLogicalIndices: emittedLogicalIndices,
    });
    if (ptrs.length === 0) return;
    const id = `p${page.index}-dup-${page.runs.length}-${ptrs[0]}`;
    const clone = new TextRun({
      id,
      pageIndex: page.index,
      pdfiumObjPtr: ptrs[0],
      bounds: {
        x: newX,
        y: newY,
        width: src.bounds.width,
        height: src.bounds.height,
      },
      matrix: { a: 1, b: 0, c: 0, d: 1, e: newX, f: newY },
      text: src.text,
      fontId: fallbackFontIdFor(fallback),
      fontSize: src.fontSize,
      fill: { ...src.fill },
      fontSubset: false,
    });
    const pieces = orderEmittedTextPieces(
      ptrs,
      emittedTexts,
      emittedLogicalIndices,
    );
    clone.mergedFromPtrs = pieces.map((piece) => piece.ptr);
    clone.mergedFromTexts = pieces.map((piece) => piece.text);
    clone.mergedFromBounds = pieces.map((piece) =>
      textObjectBoundsPt(doc.module, piece.ptr, newX),
    );
    clone.mergedFromCharStarts = pieces.map((piece) => piece.logicalStart);
    clone.paragraphMemberPtrs = [ptrs[0]];
    clone.paragraphMemberFs = [newY];
    clone.paragraphLeafPtrs = [...ptrs];
    clone.paragraphLeafContainers = ptrs.map(() => 0);
    page.setRuns([...page.runs, clone]);
    page.markDirty();
    page.markNeedsGenerate();
    this.createdRunId = id;
    this.createdObjPtrs = ptrs;
  }

  revert(doc: EditorDocument): void {
    if (this.createdObjPtrs.length === 0 || !this.createdRunId) return;
    const page = doc.page(this.pageIndex);
    for (const ptr of this.createdObjPtrs) {
      doc.module.FPDFPage_RemoveObject(page.pagePtr, ptr);
    }
    page.setRuns(page.runs.filter((r) => r.id !== this.createdRunId));
    page.markDirty();
    page.markNeedsGenerate();
  }
}
