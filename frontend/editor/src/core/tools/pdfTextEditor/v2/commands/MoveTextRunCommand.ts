import type { Command } from "@app/tools/pdfTextEditor/v2/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { collectMemberPtrs } from "@app/tools/pdfTextEditor/v2/commands/editTextHelpers";

/**
 * Translate a text run by (dx, dy) in PDF page-space points.
 *
 * Uses post-multiply `FPDFPageObj_Transform(obj, 1, 0, 0, 1, dx, dy)`
 * which preserves any scale/rotation already baked into the run's
 * matrix and just moves it.
 *
 * For LineGrouper-merged runs (where the rep is backed by many per-word
 * PDFium text objects), Transform is applied to EVERY sub-object so the
 * whole run moves together. The previous version only translated
 * `run.pdfiumObjPtr` and the rest of the sub-words stayed in place,
 * producing a partial drag.
 */
export class MoveTextRunCommand implements Command {
  readonly type = "move-text-run";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly dx: number;
  private readonly dy: number;
  private applied: boolean;

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
    this.applied = false;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || !run.pdfiumObjPtr) return;
    translateAll(doc, collectMemberPtrs(run), this.dx, this.dy);
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
    // Per-line baselines move too so re-emit positioning stays correct.
    if (run.paragraphMemberFs.length > 0) {
      run.paragraphMemberFs = run.paragraphMemberFs.map((f) => f + this.dy);
    }
    if (run.paragraphLineSlots.length > 0) {
      run.paragraphLineSlots = run.paragraphLineSlots.map((s) => ({
        ...s,
        baselineY: s.baselineY + this.dy,
        matrixE: s.matrixE + this.dx,
        mergedFromBounds: s.mergedFromBounds.map((b) => ({
          x: b.x + this.dx,
          right: b.right + this.dx,
        })),
      }));
    }
    if (run.mergedFromBounds.length > 0) {
      run.mergedFromBounds = run.mergedFromBounds.map((b) => ({
        x: b.x + this.dx,
        right: b.right + this.dx,
      }));
    }
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    this.applied = true;
  }

  revert(doc: EditorDocument): void {
    if (!this.applied) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run || !run.pdfiumObjPtr) return;
    translateAll(doc, collectMemberPtrs(run), -this.dx, -this.dy);
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
    if (run.paragraphMemberFs.length > 0) {
      run.paragraphMemberFs = run.paragraphMemberFs.map((f) => f - this.dy);
    }
    if (run.paragraphLineSlots.length > 0) {
      run.paragraphLineSlots = run.paragraphLineSlots.map((s) => ({
        ...s,
        baselineY: s.baselineY - this.dy,
        matrixE: s.matrixE - this.dx,
        mergedFromBounds: s.mergedFromBounds.map((b) => ({
          x: b.x - this.dx,
          right: b.right - this.dx,
        })),
      }));
    }
    if (run.mergedFromBounds.length > 0) {
      run.mergedFromBounds = run.mergedFromBounds.map((b) => ({
        x: b.x - this.dx,
        right: b.right - this.dx,
      }));
    }
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    this.applied = false;
  }
}

function translateAll(
  doc: EditorDocument,
  ptrs: number[],
  dx: number,
  dy: number,
): void {
  if (dx === 0 && dy === 0) return;
  const m = doc.module;
  const seen = new Set<number>();
  for (const ptr of ptrs) {
    if (!ptr || seen.has(ptr)) continue;
    seen.add(ptr);
    try {
      m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, dx, dy);
    } catch {
      /* best-effort - stale ptr silently skipped */
    }
  }
}
