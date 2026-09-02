import type { Command } from "@app/tools/pdfTextEditor/commands/Command";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import type {
  RowFill,
  TableModel,
} from "@app/tools/pdfTextEditor/model/TableModel";
import type { PageRect, RGBA } from "@app/tools/pdfTextEditor/types";
import type { ScanColors } from "@app/tools/pdfTextEditor/util/scanSampling";
import {
  measureObjBoxPt,
  measureObjSpanPt,
} from "@app/tools/pdfTextEditor/commands/editTextHelpers";
import {
  emitCellText,
  redrawGrid,
  removeObjects,
} from "@app/tools/pdfTextEditor/commands/tableHelpers";

const FPDF_PAGEOBJ_IMAGE = 3;
const FPDF_PAGEOBJ_FORM = 5;
const DEFAULT_LINE_WIDTH = 0.75;
// Bleed so the scan's own printed rules are covered rather than left as a
// halo. A scan is never perfectly square to the page, so its rules need more
// room than a digital table's would.
const MASK_BLEED_PT = 3;
/** Below this a cell's shading is just the paper, and one rect covers both. */
const SHADE_DELTA = 24;
/** Bounds on the fit, so one bad measurement cannot stretch a word. */
const MIN_SQUEEZE = 0.4;
const MAX_STRETCH = 2.5;
/** Rough cap-height fraction of an em, to start the fit near 1. */
const CAP_RATIO = 0.72;
const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 255 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 255 };

interface FormModule {
  FPDFFormObj_CountObjects?: (form: number) => number;
  FPDFFormObj_GetObject?: (form: number, index: number) => number;
}

interface ZOrderModule {
  FPDFPage_InsertObjectAtIndex?: (
    page: number,
    obj: number,
    index: number,
  ) => boolean | number;
}

const differs = (a: RGBA, b: RGBA): boolean =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > SHADE_DELTA;

/** Every object a run was built from; OCR emits one per word. */
const memberPtrs = (run: TextRun): number[] => {
  const members =
    run.paragraphLeafPtrs.length > 0
      ? run.paragraphLeafPtrs
      : run.mergedFromPtrs.length > 0
        ? run.mergedFromPtrs
        : [run.pdfiumObjPtr];
  return members.filter((p) => p > 0);
};

const fit = (ratio: number): number =>
  Number.isFinite(ratio)
    ? Math.min(MAX_STRETCH, Math.max(MIN_SQUEEZE, ratio))
    : 1;

// Turns a table that only exists as pixels into real page objects.
//
// A scan carries its table as a raster image with an INVISIBLE OCR text layer
// on top, and that layer lives inside a form XObject. FPDFPage_GenerateContent
// rewrites only the PAGE content stream, so anything done to an object inside
// that form - render mode, transform - draws correctly in the live view and is
// then dropped on save. So the OCR text is not un-hidden and moved: it is
// re-emitted as new page-level objects in the colours the scan was printed in,
// and the picture of the table is painted over.
export class MaterialiseTableCommand implements Command {
  readonly type = "materialise-table";
  private readonly tableId: string;
  private readonly colors: ScanColors | null;
  /** Rectangles painted over the scan: the paper, then any shaded row. */
  private paintedPtrs: number[] = [];
  /** The replacement text this command created. */
  private emittedPtrs: number[] = [];
  /** Form containers dropped because the table was all they held. */
  private droppedForms: { ptr: number; index: number }[] = [];
  private prevRuns: TextRun[] | null = null;
  private prevCellRuns: (string | null)[][] | null = null;
  private prevExtraRuns: (string[] | null)[][] | null = null;
  private prevRowFills: RowFill[] = [];
  private wasRuled = false;
  private prevLineColor: RGBA | null = null;

  constructor(opts: { tableId: string; colors?: ScanColors | null }) {
    this.tableId = opts.tableId;
    this.colors = opts.colors ?? null;
  }

  apply(doc: EditorDocument): void {
    const { page, model } = this.locate(doc);
    if (!page || !model) return;
    this.prevRuns = [...page.runs];
    this.prevCellRuns = model.cellRuns.map((row) => [...row]);
    this.prevExtraRuns = model.cellExtraRuns.map((row) =>
      row.map((ids) => (ids ? [...ids] : null)),
    );
    this.paintBackground(doc, page, model);
    this.reemitText(doc, page, model);
    this.wasRuled = model.ruled;
    model.ruled = true;
    if (model.lineWidth <= 0) model.lineWidth = DEFAULT_LINE_WIDTH;
    if (this.colors) {
      this.prevLineColor = { ...model.lineColor };
      model.lineColor = { ...this.colors.rule };
    }
    redrawGrid(doc, page, model);
    page.markDirty();
    page.markNeedsGenerate();
  }

  revert(doc: EditorDocument): void {
    const { page, model } = this.locate(doc);
    if (!page || !model) return;
    const mod = doc.module as unknown as ZOrderModule;
    if (this.emittedPtrs.length > 0) {
      removeObjects(doc.module, page, this.emittedPtrs);
      this.emittedPtrs = [];
    }
    // Lowest index last, so each form lands back where it was taken from.
    for (const { ptr, index } of [...this.droppedForms].reverse()) {
      mod.FPDFPage_InsertObjectAtIndex?.(page.pagePtr, ptr, index);
    }
    this.droppedForms = [];
    if (this.paintedPtrs.length > 0) {
      removeObjects(doc.module, page, this.paintedPtrs);
      this.paintedPtrs = [];
      model.rowFills = this.prevRowFills;
      this.prevRowFills = [];
    }
    if (this.prevRuns) {
      page.setRuns(this.prevRuns);
      this.prevRuns = null;
    }
    if (this.prevCellRuns) {
      model.cellRuns = this.prevCellRuns;
      this.prevCellRuns = null;
    }
    if (this.prevExtraRuns) {
      model.cellExtraRuns = this.prevExtraRuns;
      this.prevExtraRuns = null;
    }
    if (this.prevLineColor) {
      model.lineColor = this.prevLineColor;
      this.prevLineColor = null;
    }
    if (!this.wasRuled) {
      removeObjects(doc.module, page, [...model.hLinePtrs, ...model.vLinePtrs]);
      model.hLinePtrs = [];
      model.vLinePtrs = [];
      model.ruled = false;
    }
    page.markDirty();
    page.markNeedsGenerate();
  }

  // Replace each cell's OCR text with a page-level text object standing where
  // the original stood. Position and width are measured off the original
  // rather than derived from the cell, so the rebuilt row keeps the spacing
  // the scan had instead of snapping to a uniform inset.
  private reemitText(doc: EditorDocument, page: Page, model: TableModel): void {
    const replaced = new Set<string>();
    const replacedPtrs = new Set<number>();
    const cellRuns = model.cellRuns.map((row) => [...row]);
    const extras = model.cellExtraRuns.map(() =>
      Array.from({ length: model.cols }, () => null as string[] | null),
    );
    for (let r = 0; r < model.rows; r++) {
      for (let c = 0; c < model.cols; c++) {
        const ink = this.colors?.cells[r]?.[c]?.ink ?? BLACK;
        const made: string[] = [];
        for (const id of model.runsAt(r, c)) {
          const run = page.findRun(id);
          if (!run) continue;
          replaced.add(id);
          for (const ptr of memberPtrs(run)) replacedPtrs.add(ptr);
          const fresh = this.reemitRun(doc, page, run, ink);
          if (fresh) made.push(fresh);
        }
        if (made.length === 0) continue;
        cellRuns[r][c] = made[0];
        extras[r][c] = made.length > 1 ? made.slice(1) : null;
      }
    }
    model.cellRuns = cellRuns;
    model.cellExtraRuns = extras;
    this.dropSpentForms(doc, page, replacedPtrs);
    // The originals are invisible and stay where they were; dropping them from
    // the model keeps a phantom selectable copy from trailing the moved table.
    page.setRuns(page.runs.filter((run) => !replaced.has(run.id)));
  }

  // One replacement object, fitted to the box the original occupied.
  //
  // The OCR font SIZE is not usable: tesseract guesses it per word, and on one
  // uniform scan it ranged 8.05 to 10.39, which reproduces as a table of
  // mismatched text. The word BOX is reliable - OCR fits it to the ink it
  // found in the picture - so the replacement is scaled onto that box instead.
  private reemitRun(
    doc: EditorDocument,
    page: Page,
    run: TextRun,
    ink: RGBA,
  ): string | null {
    if (!run.text.trim()) return null;
    const target = this.placeOf(doc, run);
    if (!target || target.width <= 0 || target.height <= 0) return null;
    const nominal = Math.min(72, Math.max(4, target.height / CAP_RATIO));
    const emitted = emitCellText(doc, page, 0, 0, run.text, nominal, ink);
    if (!emitted) return null;
    this.emittedPtrs.push(emitted.ptr);
    const box = measureObjBoxPt(doc.module, emitted.ptr);
    if (box && box.width > 0 && box.height > 0) {
      const sx = fit(target.width / box.width);
      const sy = fit(target.height / box.height);
      doc.module.FPDFPageObj_Transform(
        emitted.ptr,
        sx,
        0,
        0,
        sy,
        target.x - box.x * sx,
        target.y - box.y * sy,
      );
      emitted.run.bounds = { ...target };
      emitted.run.fontSize = nominal * sy;
      emitted.run.matrix = {
        a: sx,
        b: 0,
        c: 0,
        d: sy,
        e: target.x - box.x * sx,
        f: target.y - box.y * sy,
      };
    }
    return emitted.run.id;
  }

  // Where an OCR run actually sits on the page, measured across every object
  // the run was built from - OCR emits one per word.
  private placeOf(doc: EditorDocument, run: TextRun): PageRect | null {
    const ptrs = memberPtrs(run);
    if (ptrs.length === 0) return run.bounds;
    const span = measureObjSpanPt(doc.module, ptrs);
    let bottom = Infinity;
    let top = -Infinity;
    for (const ptr of ptrs) {
      const box = measureObjBoxPt(doc.module, ptr);
      if (!box) continue;
      bottom = Math.min(bottom, box.y);
      top = Math.max(top, box.y + box.height);
    }
    if (!span || !Number.isFinite(bottom)) return run.bounds;
    return {
      x: span.left,
      y: bottom,
      width: span.right - span.left,
      height: top - bottom,
    };
  }

  // Drop a form container whose ONLY contents were this table's text: it is
  // now a duplicate of what was just emitted. The test walks the form's real
  // children, not the runs pointing at it - a form holding a logo alongside
  // the table would otherwise count as spent and take the logo with it.
  private dropSpentForms(
    doc: EditorDocument,
    page: Page,
    replacedPtrs: Set<number>,
  ): void {
    const m = doc.module;
    const total = m.FPDFPage_CountObjects(page.pagePtr);
    const found: { ptr: number; index: number }[] = [];
    for (let i = 0; i < total; i++) {
      const obj = m.FPDFPage_GetObject(page.pagePtr, i);
      if (!obj || m.FPDFPageObj_GetType(obj) !== FPDF_PAGEOBJ_FORM) continue;
      if (this.formIsSpent(doc, obj, replacedPtrs))
        found.push({ ptr: obj, index: i });
    }
    // Highest index first, so each removal leaves the earlier ones in place.
    for (const entry of [...found].reverse()) {
      m.FPDFPage_RemoveObject(page.pagePtr, entry.ptr);
    }
    this.droppedForms = found;
  }

  /** True when every object inside the form is one this rebuild replaced. */
  private formIsSpent(
    doc: EditorDocument,
    formPtr: number,
    replacedPtrs: Set<number>,
  ): boolean {
    const m = doc.module;
    const forms = m as unknown as FormModule;
    if (!forms.FPDFFormObj_CountObjects || !forms.FPDFFormObj_GetObject) {
      return false;
    }
    const stack = [formPtr];
    let leaves = 0;
    while (stack.length > 0) {
      const current = stack.pop() as number;
      const count = forms.FPDFFormObj_CountObjects(current);
      for (let i = 0; i < count; i++) {
        const child = forms.FPDFFormObj_GetObject(current, i);
        if (!child) continue;
        if (m.FPDFPageObj_GetType(child) === FPDF_PAGEOBJ_FORM) {
          stack.push(child);
          continue;
        }
        if (!replacedPtrs.has(child)) return false;
        leaves++;
      }
    }
    return leaves > 0;
  }

  // Cover the scanned table in the colours it actually had: one rectangle of
  // its paper to erase the scan, then a band per differently shaded row. Bands
  // go in as row fills so they travel with the table; loose rectangles would
  // stay put and ghost the old banding.
  private paintBackground(
    doc: EditorDocument,
    page: Page,
    model: TableModel,
  ): void {
    const paper = this.colors?.paper ?? WHITE;
    const at = this.aboveImages(doc, page);
    const ptrs: number[] = [];
    const base = this.paintRect(
      doc,
      page,
      model.colEdges[0] - MASK_BLEED_PT,
      model.rowEdges[model.rows] - MASK_BLEED_PT,
      model.colEdges[model.cols] + MASK_BLEED_PT,
      model.rowEdges[0] + MASK_BLEED_PT,
      paper,
      at,
    );
    if (base) ptrs.push(base);
    this.prevRowFills = model.rowFills;
    const fills: RowFill[] = [...model.rowFills];
    const left = model.colEdges[0];
    const right = model.colEdges[model.cols];
    for (let r = 0; r < model.rows; r++) {
      const shade = this.rowShade(model, r, paper);
      if (!shade) continue;
      const rect = {
        x: left,
        y: model.rowEdges[r + 1],
        width: right - left,
        height: model.rowEdges[r] - model.rowEdges[r + 1],
      };
      const ptr = this.paintRect(
        doc,
        page,
        rect.x,
        rect.y,
        rect.x + rect.width,
        rect.y + rect.height,
        shade,
        at + ptrs.length,
      );
      if (!ptr) continue;
      ptrs.push(ptr);
      fills.push({ row: r, ptr, rect, color: { ...shade } });
    }
    model.rowFills = fills;
    this.paintedPtrs = ptrs;
  }

  // What a whole row was shaded, or null if it matched the paper. Taking the
  // most common cell colour keeps one misread cell from tinting the band.
  private rowShade(model: TableModel, row: number, paper: RGBA): RGBA | null {
    const counts = new Map<string, { n: number; c: RGBA }>();
    for (let c = 0; c < model.cols; c++) {
      const bg = this.colors?.cells[row]?.[c]?.bg;
      if (!bg) continue;
      const key = `${bg.r},${bg.g},${bg.b}`;
      const hit = counts.get(key);
      if (hit) hit.n++;
      else counts.set(key, { n: 1, c: bg });
    }
    let best: RGBA | null = null;
    let bestN = 0;
    for (const entry of counts.values()) {
      if (entry.n > bestN) {
        bestN = entry.n;
        best = entry.c;
      }
    }
    return best && differs(best, paper) ? best : null;
  }

  /** One filled rectangle, inserted so it hides the scan but not the text. */
  private paintRect(
    doc: EditorDocument,
    page: Page,
    left: number,
    bottom: number,
    right: number,
    top: number,
    color: RGBA,
    index: number,
  ): number {
    const m = doc.module;
    const ptr = m.FPDFPageObj_CreateNewRect(
      left,
      bottom,
      right - left,
      top - bottom,
    );
    if (!ptr) return 0;
    m.FPDFPageObj_SetFillColor(ptr, color.r, color.g, color.b, 255);
    m.FPDFPath_SetDrawMode(ptr, 2, false);
    const mod = m as unknown as ZOrderModule;
    mod.FPDFPage_InsertObjectAtIndex?.(page.pagePtr, ptr, index);
    return ptr;
  }

  /** Index just past the last image, so paint covers the scan and nothing else. */
  private aboveImages(doc: EditorDocument, page: Page): number {
    const m = doc.module;
    const total = m.FPDFPage_CountObjects(page.pagePtr);
    let index = 0;
    for (let i = 0; i < total; i++) {
      const obj = m.FPDFPage_GetObject(page.pagePtr, i);
      if (obj && m.FPDFPageObj_GetType(obj) === FPDF_PAGEOBJ_IMAGE) {
        index = i + 1;
      }
    }
    return index;
  }

  private locate(doc: EditorDocument): {
    page: Page | null;
    model: TableModel | null;
  } {
    const match = /^p(\d+)-/.exec(this.tableId);
    const pageIndex = match ? Number(match[1]) : null;
    const pages =
      pageIndex !== null ? [doc.page(pageIndex)] : doc.loadedPages();
    for (const page of pages) {
      const model = page.tables.find((t) => t.id === this.tableId);
      if (model) return { page, model };
    }
    return { page: null, model: null };
  }

  describe(): string {
    return "Rebuild scanned table";
  }
}
