import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { RGBA } from "@app/tools/pdfTextEditor/types";
import { PdfiumTextWriter } from "@app/tools/pdfTextEditor/pdfium/PdfiumTextWriter";
import { collectMemberPtrs } from "@app/tools/pdfTextEditor/commands/editTextHelpers";

export class SetColourCommand implements Command {
  readonly type = "set-colour";
  private readonly pageIndex: number;
  private readonly runId: string;
  private readonly nextFill: RGBA;
  private prevFill: RGBA | null;
  /** Each member object's OWN pre-apply fill. */
  private prevMemberFills: Array<{ ptr: number; fill: RGBA }> | null;

  constructor(opts: { pageIndex: number; runId: string; nextFill: RGBA }) {
    this.pageIndex = opts.pageIndex;
    this.runId = opts.runId;
    this.nextFill = opts.nextFill;
    this.prevFill = null;
    this.prevMemberFills = null;
  }

  apply(doc: EditorDocument): void {
    const page = doc.page(this.pageIndex);
    const run = page.findRun(this.runId);
    if (!run) return;
    if (this.prevFill === null) {
      this.prevFill = { ...run.fill };
      const m = doc.module;
      const seen = new Set<number>();
      this.prevMemberFills = [];
      for (const ptr of collectMemberPtrs(run)) {
        if (!ptr || seen.has(ptr)) continue;
        seen.add(ptr);
        this.prevMemberFills.push({
          ptr,
          fill: readObjFill(m, ptr) ?? { ...run.fill },
        });
      }
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
    // Restore each member's own colour rather than stamping the rep fill
    // over the whole group.
    const m = doc.module;
    let restoredAny = false;
    for (const entry of this.prevMemberFills ?? []) {
      try {
        m.FPDFPageObj_SetFillColor(
          entry.ptr,
          entry.fill.r,
          entry.fill.g,
          entry.fill.b,
          entry.fill.a,
        );
        restoredAny = true;
      } catch {
        /* best-effort - stale ptrs silently skipped */
      }
    }
    if (restoredAny) page.markNeedsGenerate();
    else PdfiumTextWriter.commitRunFill(doc, page, run);
  }

  /** One colour-picker DRAG fires dozens of commands. */
  coalesceKey(): string {
    return "set-colour";
  }

  describe(): string {
    return `Set colour on ${this.runId}`;
  }
}

/** Read an object's current fill colour (0-255 RGBA), or null on failure. */
export function readObjFill(
  m: import("@embedpdf/pdfium").WrappedPdfiumModule,
  objPtr: number,
): RGBA | null {
  const exports = m.pdfium.wasmExports as unknown as {
    malloc: (n: number) => number;
    free: (p: number) => void;
  };
  const r = exports.malloc(4);
  const g = exports.malloc(4);
  const b = exports.malloc(4);
  const a = exports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetFillColor(objPtr, r, g, b, a)) return null;
    return {
      r: m.pdfium.getValue(r, "i32"),
      g: m.pdfium.getValue(g, "i32"),
      b: m.pdfium.getValue(b, "i32"),
      a: m.pdfium.getValue(a, "i32"),
    };
  } catch {
    return null;
  } finally {
    exports.free(r);
    exports.free(g);
    exports.free(b);
    exports.free(a);
  }
}
