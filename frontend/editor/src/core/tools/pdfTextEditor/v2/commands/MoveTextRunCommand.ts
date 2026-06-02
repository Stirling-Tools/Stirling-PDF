import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";

/**
 * Translate a text run by (dx, dy) in PDF page-space points.
 *
 * Uses post-multiply `FPDFPageObj_Transform(obj, 1, 0, 0, 1, dx, dy)`
 * which preserves any scale/rotation already baked into the run's
 * matrix and just moves it.
 *
 * IMPORTANT: text runs in v2 are often composites - LineGrouper merges
 * many per-glyph PDFium text objects into one logical TextRun, and
 * paragraph recognition merges per-line objects. The previous version
 * of this command only translated `run.pdfiumObjPtr`, which moves just
 * the anchor leaf - the remaining glyph/line objects stay put and the
 * user sees "only part of my run moved". We now translate every leaf
 * pointer the run owns: `paragraphLeafPtrs` for paragraphs (which is
 * every glyph across every line), `mergedFromPtrs` for line-grouped
 * runs, falling back to the single `pdfiumObjPtr` for atomic runs.
 *
 * Each leaf is also a form-xobject container in some PDFs, so we need
 * to apply the transform via the same FPDFPageObj_Transform call -
 * PDFium happily handles either page objects or xobject-nested
 * objects with the same API.
 */
export class MoveTextRunCommand implements Command {
  readonly type = "move-text-run";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly dx: number;
  private readonly dy: number;
  private appliedPtrs: number[];

  constructor(opts: {
    pageIndex: number;
    runId: string;
    dx: number;
    dy: number;
  }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.dx = opts.dx;
    this.dy = opts.dy;
    this.appliedPtrs = [];
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const ptrs = collectMemberPtrs(run);
    if (ptrs.length === 0) return;
    for (const ptr of ptrs) {
      if (!ptr) continue;
      try {
        doc.module.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, this.dx, this.dy);
        this.appliedPtrs.push(ptr);
      } catch {
        /* skip leaks; revert only undoes the ptrs we actually moved */
      }
    }
    run.matrix = {
      ...run.matrix,
      e: run.matrix.e + this.dx,
      f: run.matrix.f + this.dy,
    };
    run.bounds = {
      ...run.bounds,
      x: run.bounds.x + this.dx,
      y: run.bounds.y + this.dy,
    };
    // Shift every per-sub-object bound the partial-edit path uses to
    // resolve future edits so paragraphs / merged runs stay
    // round-trippable after a move.
    for (const b of run.mergedFromBounds) {
      b.x += this.dx;
      b.right += this.dx;
    }
    run.dirty = true;
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
  }

  revert(doc: EditorDocument): void {
    if (this.appliedPtrs.length === 0) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    for (const ptr of this.appliedPtrs) {
      if (!ptr) continue;
      try {
        doc.module.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, -this.dx, -this.dy);
      } catch {
        /* best-effort */
      }
    }
    run.matrix = {
      ...run.matrix,
      e: run.matrix.e - this.dx,
      f: run.matrix.f - this.dy,
    };
    run.bounds = {
      ...run.bounds,
      x: run.bounds.x - this.dx,
      y: run.bounds.y - this.dy,
    };
    for (const b of run.mergedFromBounds) {
      b.x -= this.dx;
      b.right -= this.dx;
    }
    run.dirty = true;
    page.markDirty();
    doc.module.FPDFPage_GenerateContent(page.pagePtr);
    this.appliedPtrs = [];
  }
}

/**
 * Every PDFium pointer that backs a run. Mirrors
 * `editTextHelpers.collectMemberPtrs` but inlined here to avoid the
 * commands/editTextHelpers cycle (editTextHelpers already imports
 * other command files; importing back the other way could close a
 * cycle the dpdm check flags).
 */
function collectMemberPtrs(
  run: import("@app/tools/pdfTextEditor/v2/model/TextRun").TextRun,
): number[] {
  if (run.paragraphLeafPtrs.length > 0) return run.paragraphLeafPtrs;
  if (run.paragraphMemberPtrs.length > 0) return run.paragraphMemberPtrs;
  if (run.mergedFromPtrs.length > 0) return run.mergedFromPtrs;
  if (run.pdfiumObjPtr) return [run.pdfiumObjPtr];
  return [];
}
