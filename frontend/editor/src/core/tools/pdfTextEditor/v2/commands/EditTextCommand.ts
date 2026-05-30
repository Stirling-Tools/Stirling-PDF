import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { PdfiumTextWriter } from "@app/tools/pdfTextEditor/v2/pdfium/PdfiumTextWriter";
import { sampleBackground } from "@app/tools/pdfTextEditor/v2/pdfium/BackgroundSampler";
import {
  collectContainersByPtr,
  collectMemberPtrs,
  emitFillRect,
  emitTextLine,
  everyCharIn,
  removeMemberPtrs,
} from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";
import { helveticaVariantFor } from "@app/tools/pdfTextEditor/v2/util/helveticaVariant";

interface RevertLine {
  text: string;
  x: number;
  y: number;
  fill: { r: number; g: number; b: number; a: number };
  fontSize: number;
}

/**
 * Edit a text run.
 *
 * Two paths: plain in-place SetText (singleton base-14), and
 * collapse-and-overlay. The overlay path paints a cover rect over the
 * original bounds (because PDFium can't remove text from inside a form
 * xobject) and stacks fresh page-level text objects on top.
 *
 * The replacement keeps the original font when every new character was
 * already present in the source string AND the source is neither a
 * subset font nor nested in a form xobject; otherwise it falls back to
 * base-14 Helvetica so the user always sees real glyphs.
 */
export class EditTextCommand implements Command {
  readonly type = "edit-text";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextText: string;
  private prevText: string | null = null;

  private overlaid = false;
  private prevObjPtr = 0;
  private prevFontId: string | null = null;
  private coverRectPtr = 0;
  private createdPtrs: number[] = [];
  private newTextPtr = 0;
  private revertLines: RevertLine[] = [];
  private revertCreatedPtrs: number[] = [];

  constructor(opts: { pageIndex: number; runId: string; nextText: string }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextText = opts.nextText;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    if (this.prevText === null) this.prevText = run.text;

    const alreadyBase14 = /^base14:/.test(run.fontId);
    const needsOverlay =
      !this.overlaid &&
      !alreadyBase14 &&
      (run.mergedFromPtrs.length > 0 ||
        run.fontSubset ||
        run.pdfiumObjPtr !== 0);

    if (!needsOverlay) {
      run.text = this.nextText;
      run.dirty = true;
      page.markDirty();
      PdfiumTextWriter.commitRunText(doc, page, run);
      return;
    }

    this.overlaid = true;
    this.prevObjPtr = run.pdfiumObjPtr;
    if (this.prevFontId === null) this.prevFontId = run.fontId;
    const fallbackFamily = helveticaVariantFor(this.prevFontId);
    const m = doc.module;

    const bg = sampleBackground(m, page, run.bounds);
    const safeChars = everyCharIn(this.nextText, this.prevText ?? "");
    const canReuseFont =
      safeChars && !run.fontSubset && run.containerPtr === 0;
    const originalFontPtr =
      canReuseFont && run.pdfiumObjPtr ? safeGetFont(m, run.pdfiumObjPtr) : 0;

    this.revertLines = snapshotRevertLines(run, this.prevText ?? "");

    const memberPtrs = collectMemberPtrs(run);
    const containers = collectContainersByPtr(run);
    const allRemoved = removeMemberPtrs(
      m,
      page,
      memberPtrs,
      containers,
      run.containerPtr,
    );

    if (!allRemoved) {
      this.coverRectPtr = emitFillRect(m, page, run.bounds, bg.fill);
      if (this.coverRectPtr) this.createdPtrs.push(this.coverRectPtr);
    }

    const outputLines = this.nextText.split(/\r?\n/);
    const lineHeight =
      run.paragraphLineHeight > 0 ? run.paragraphLineHeight : run.fontSize * 1.2;
    const textPtrs: number[] = [];
    for (let i = 0; i < outputLines.length; i++) {
      const ptr = emitTextLine({
        doc,
        page,
        text: outputLines[i],
        x: run.matrix.e,
        y: run.matrix.f - i * lineHeight,
        fontSize: run.fontSize,
        fill: run.fill,
        originalFontPtr,
        fallbackFamily,
      });
      if (!ptr) continue;
      this.createdPtrs.push(ptr);
      textPtrs.push(ptr);
    }

    if (textPtrs.length > 0) {
      this.newTextPtr = textPtrs[0];
      run.pdfiumObjPtr = textPtrs[0];
      if (originalFontPtr === 0) {
        run.fontId = `base14:${fallbackFamily}`;
        run.fontSubset = false;
      }
      run.paragraphMemberPtrs = textPtrs;
      run.paragraphMemberContainers = textPtrs.map(() => 0);
      run.paragraphMemberFs = textPtrs.map(
        (_, i) => run.matrix.f - i * lineHeight,
      );
    }

    run.mergedFromPtrs = [];
    run.text = this.nextText;
    run.dirty = true;
    page.markDirty();
    m.FPDFPage_GenerateContent(page.pagePtr);
  }

  revert(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || this.prevText === null) return;
    const m = doc.module;

    if (!this.overlaid) {
      run.text = this.prevText;
      run.dirty = true;
      page.markDirty();
      PdfiumTextWriter.commitRunText(doc, page, run);
      return;
    }

    for (const ptr of this.createdPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPage_RemoveObject(page.pagePtr, ptr);
      } catch {
        /* best-effort */
      }
    }
    this.coverRectPtr = 0;
    this.newTextPtr = 0;
    this.createdPtrs = [];

    // PDFium has no insert-into-form-xobject API, so the truly-original
    // pointers (if they lived in a form) are gone forever. Re-emit a
    // visually-equivalent paragraph at page level using the snapshot
    // captured during apply.
    const revertFallback = helveticaVariantFor(this.prevFontId ?? "");
    const restoredPtrs: number[] = [];
    for (const line of this.revertLines) {
      const ptr = emitTextLine({
        doc,
        page,
        text: line.text,
        x: line.x,
        y: line.y,
        fontSize: line.fontSize,
        fill: line.fill,
        originalFontPtr: 0,
        fallbackFamily: revertFallback,
      });
      if (ptr) restoredPtrs.push(ptr);
    }
    this.revertCreatedPtrs = restoredPtrs;

    run.pdfiumObjPtr = restoredPtrs[0] ?? this.prevObjPtr;
    run.fontId = `base14:${revertFallback}`;
    run.fontSubset = false;
    run.text = this.prevText;
    run.mergedFromPtrs = [];
    run.paragraphMemberPtrs = restoredPtrs;
    run.paragraphMemberContainers = restoredPtrs.map(() => 0);
    run.paragraphMemberFs = this.revertLines.map((l) => l.y);
    run.containerPtr = 0;
    run.dirty = true;
    this.overlaid = false;
    page.markDirty();
    m.FPDFPage_GenerateContent(page.pagePtr);
  }

  describe(): string {
    return `Type into ${this.runId}`;
  }
}

function safeGetFont(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  objPtr: number,
): number {
  const fn = (m as unknown as { FPDFTextObj_GetFont?: (p: number) => number })
    .FPDFTextObj_GetFont;
  if (!fn) return 0;
  try {
    return fn(objPtr);
  } catch {
    return 0;
  }
}

function snapshotRevertLines(
  run: import("@app/tools/pdfTextEditor/v2/model/TextRun").TextRun,
  prevText: string,
): RevertLine[] {
  const lines = prevText.split(/\r?\n/);
  const lineHeight =
    run.paragraphLineHeight > 0 ? run.paragraphLineHeight : run.fontSize * 1.2;
  return lines.map((text, idx) => ({
    text,
    x: run.matrix.e,
    y: run.matrix.f - idx * lineHeight,
    fill: { ...run.fill },
    fontSize: Math.max(4, run.fontSize),
  }));
}
