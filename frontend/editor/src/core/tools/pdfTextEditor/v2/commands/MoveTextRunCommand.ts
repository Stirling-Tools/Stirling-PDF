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
 * Text runs are often composites - LineGrouper merges many per-glyph PDFium
 * text objects into one logical run, and paragraph recognition merges per-line
 * objects. Translating only `run.pdfiumObjPtr` would move just the anchor leaf
 * and leave the rest in place (partial drag), so we translate EVERY leaf the
 * run owns (`collectMemberPtrs`: paragraphLeafPtrs / mergedFromPtrs / the
 * single ptr) and remember exactly which ptrs we moved so revert is precise.
 * The per-line baselines and sub-run bounds are shifted too so the
 * partial-edit path stays round-trippable after a move.
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
    const m = doc.module;
    const seen = new Set<number>();
    for (const ptr of collectMemberPtrs(run)) {
      if (!ptr || seen.has(ptr)) continue;
      seen.add(ptr);
      try {
        m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, this.dx, this.dy);
        this.appliedPtrs.push(ptr);
      } catch {
        /* skip leaks; revert only undoes the ptrs we actually moved */
      }
    }
    this.shiftModel(run, this.dx, this.dy);
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    if (this.appliedPtrs.length === 0) return;
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    const m = doc.module;
    for (const ptr of this.appliedPtrs) {
      if (!ptr) continue;
      try {
        m.FPDFPageObj_Transform(ptr, 1, 0, 0, 1, -this.dx, -this.dy);
      } catch {
        /* best-effort */
      }
    }
    this.shiftModel(run, -this.dx, -this.dy);
    run.dirty = true;
    page.markDirty();
    page.markNeedsGenerate();
    this.appliedPtrs = [];
  }

  /** Shift the run's matrix/bounds + per-line + sub-run model by (dx, dy). */
  private shiftModel(
    run: import("@app/tools/pdfTextEditor/v2/model/TextRun").TextRun,
    dx: number,
    dy: number,
  ): void {
    run.matrix = { ...run.matrix, e: run.matrix.e + dx, f: run.matrix.f + dy };
    run.bounds = { ...run.bounds, x: run.bounds.x + dx, y: run.bounds.y + dy };
    if (run.paragraphMemberFs.length > 0) {
      run.paragraphMemberFs = run.paragraphMemberFs.map((f) => f + dy);
    }
    if (run.paragraphLineSlots.length > 0) {
      run.paragraphLineSlots = run.paragraphLineSlots.map((s) => ({
        ...s,
        baselineY: s.baselineY + dy,
        matrixE: s.matrixE + dx,
        mergedFromBounds: s.mergedFromBounds.map((b) => ({
          x: b.x + dx,
          right: b.right + dx,
        })),
      }));
    }
    if (run.mergedFromBounds.length > 0) {
      run.mergedFromBounds = run.mergedFromBounds.map((b) => ({
        x: b.x + dx,
        right: b.right + dx,
      }));
    }
  }
}
