import type {
  AlignFrame,
  TextAlign,
} from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import { measureObjBoundsPt } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { MergeRunsCommand } from "@editor/tools/pdfTextEditor/commands/MergeRunsCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";

interface Box {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

interface CarriedLine {
  text: string;
  baseline: number;
  x: number;
}

export interface CarriedFormat {
  lines: CarriedLine[];
  align: TextAlign | null;
  alignFrame: AlignFrame | null;
  underline: boolean;
  listIndent: number;
  rules: Box[];
}

export type CarriedFormats = Map<number, CarriedFormat[]>;

const NEAR_PT = 2;
const carried = new WeakMap<EditorDocument, CarriedFormats>();

export function captureFormats(doc: EditorDocument): CarriedFormats {
  const formats: CarriedFormats = new Map(carried.get(doc));
  for (const page of doc.loadedPages()) {
    const list: CarriedFormat[] = [];
    for (const runId of page.paragraphFormats) {
      const run = page.findRun(runId);
      if (!run) continue;
      list.push({
        lines: linesOf(run),
        align: run.align,
        alignFrame: run.alignFrame,
        underline: run.underline,
        listIndent: run.listIndent,
        rules: (page.underlines.get(runId) ?? []).flatMap((ptr) => {
          const box = measureObjBoundsPt(doc.module, [ptr]);
          return box ? [box] : [];
        }),
      });
    }
    if (list.length > 0) formats.set(page.index, list);
  }
  return formats;
}

export function carryFormats(doc: EditorDocument, formats: CarriedFormats) {
  if (formats.size > 0) carried.set(doc, formats);
}

const words = (text: string) => text.replace(/\s+/g, " ").trim();

function sameBox(a: Box, b: Box): boolean {
  return (
    Math.abs(a.left - b.left) < NEAR_PT &&
    Math.abs(a.bottom - b.bottom) < NEAR_PT &&
    Math.abs(a.right - b.right) < NEAR_PT &&
    Math.abs(a.top - b.top) < NEAR_PT
  );
}

function distance(a: Box, b: Box): number {
  return (
    Math.abs(a.left - b.left) +
    Math.abs(a.bottom - b.bottom) +
    Math.abs(a.right - b.right) +
    Math.abs(a.top - b.top)
  );
}

function linesOf(run: TextRun): CarriedLine[] {
  const slots = run.paragraphLineSlots;
  if (slots.length === 0)
    return [{ text: words(run.text), baseline: run.matrix.f, x: run.matrix.e }];
  return slots.map((slot) => ({
    text: words(run.text.slice(Math.max(0, slot.startChar), slot.endChar)),
    baseline: slot.baselineY,
    x: slot.matrixE,
  }));
}

function sameLines(a: CarriedLine[], b: CarriedLine[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (line, i) =>
        line.text === b[i].text &&
        Math.abs(line.baseline - b[i].baseline) < NEAR_PT &&
        Math.abs(line.x - b[i].x) < NEAR_PT,
    )
  );
}

function runsFor(page: Page, format: CarriedFormat): TextRun[] {
  const free = page.runs.filter((r) => !page.paragraphFormats.has(r.id));
  const whole = free.find((r) => sameLines(linesOf(r), format.lines));
  if (whole) return [whole];
  return format.lines.flatMap((line) => {
    const run = free.find((r) => sameLines(linesOf(r), [line]));
    return run ? [run] : [];
  });
}

function rulesUnder(
  doc: EditorDocument,
  page: Page,
  run: TextRun,
  rules: Box[],
  taken: Set<number>,
): number[] {
  const baselines = linesOf(run).map((line) => line.baseline);
  const wanted = rules.filter((rule) =>
    baselines.some(
      (b) => rule.top <= b + NEAR_PT && rule.top >= b - run.fontSize,
    ),
  );
  const boxes = page.shapes.flatMap((shape) => {
    const box = measureObjBoundsPt(doc.module, [shape.pdfiumObjPtr]);
    return box ? [{ ptr: shape.pdfiumObjPtr, box }] : [];
  });
  const matched: number[] = [];
  for (const rule of wanted) {
    const best = boxes
      .filter(
        ({ ptr, box }) =>
          !taken.has(ptr) && !matched.includes(ptr) && sameBox(box, rule),
      )
      .sort((a, b) => distance(a.box, rule) - distance(b.box, rule))[0];
    if (best) matched.push(best.ptr);
  }
  return matched;
}

function rejoined(
  doc: EditorDocument,
  page: Page,
  runs: TextRun[],
  format: CarriedFormat,
): TextRun[] {
  if (runs.length < 2 || runs.length !== format.lines.length) return runs;
  const merge = new MergeRunsCommand({
    pageIndex: page.index,
    runIds: runs.map((run) => run.id),
  });
  try {
    merge.apply(doc);
  } catch {
    return runs;
  }
  const rep = merge.representativeRunId
    ? page.findRun(merge.representativeRunId)
    : null;
  return rep ? [rep] : runs;
}

export function restoreCarriedFormats(doc: EditorDocument, page: Page): void {
  const list = carried.get(doc)?.get(page.index);
  if (!list) return;
  carried.get(doc)!.delete(page.index);
  const taken = new Set<number>();
  for (const format of list) {
    const runs = rejoined(doc, page, runsFor(page, format), format);
    for (const run of runs) {
      run.align = format.align;
      run.alignFrame = format.alignFrame;
      run.underline = format.underline;
      run.listIndent = runs.length === 1 ? format.listIndent : 0;
      page.paragraphFormats.add(run.id);
      const ptrs = rulesUnder(doc, page, run, format.rules, taken);
      for (const ptr of ptrs) taken.add(ptr);
      if (ptrs.length > 0) page.underlines.set(run.id, ptrs);
    }
  }
  if (taken.size > 0)
    page.setShapes(page.shapes.filter((s) => !taken.has(s.pdfiumObjPtr)));
}
