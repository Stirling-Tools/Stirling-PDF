// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyPartialEditPlan,
  planPartialEdit,
} from "@editor/tools/pdfTextEditor/commands/partialEdit";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";

const FONT_SIZE = 12;
// measureWhitespaceAdvancePt's no-DOM estimate for one space at FONT_SIZE.
const SPACE_PT = FONT_SIZE * 0.27;

/**
 * One text object per letter, the way Chrome writes PDFs. A space between two
 * objects belongs to no object: it is a "ghost" in the run's text.
 */
function perLetterRun(text: string): TextRun {
  const run = new TextRun({
    id: "p0-t0",
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: text.length * 10, height: 14 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 800 },
    text,
    fontId: "pdf:1:Serif",
    fontSize: FONT_SIZE,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: true,
    pdfiumObjPtr: 0,
  });
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i])) continue;
    run.mergedFromPtrs.push(100 + i);
    run.mergedFromTexts.push(text[i]);
    run.mergedFromBounds.push({ x: i * 10, right: i * 10 + 8 });
    run.mergedFromCharStarts.push(i);
  }
  return run;
}

function fakeDocAndPage(objects: number[]) {
  const x = new Map<number, number>();
  const module = {
    pdfium: {
      wasmExports: { malloc: () => 16, free: () => {} },
      getValue: () => 0,
    },
    FPDFPage_CountObjects: () => objects.length,
    FPDFPage_GetObject: (_page: number, i: number) => objects[i] ?? 0,
    FPDFPage_RemoveObject: () => true,
    FPDFPageObj_Transform: (
      ptr: number,
      _a: number,
      _b: number,
      _c: number,
      _d: number,
      e: number,
    ) => {
      x.set(ptr, (x.get(ptr) ?? 0) + e);
    },
  };
  const doc = { module, docPtr: 1, loadedPages: () => [] };
  const page = { pagePtr: 2, markNeedsGenerate: () => {} };
  return {
    doc: doc as unknown as Parameters<typeof applyPartialEditPlan>[0],
    page: page as unknown as Parameters<typeof applyPartialEditPlan>[1],
    x,
  };
}

describe("deleting a space between two text objects", () => {
  it("records the removed gap before the following object", () => {
    const run = perLetterRun("Audit Desk");
    const plan = planPartialEdit(run, "Audit Desk", "AuditDesk");
    expect(plan?.ghostGaps).toEqual([{ beforeSubRunIdx: 5, removed: 1 }]);
  });

  it("shifts every following object left by the space", () => {
    const run = perLetterRun("Audit Desk");
    const plan = planPartialEdit(run, "Audit Desk", "AuditDesk")!;
    const { doc, page, x } = fakeDocAndPage(run.mergedFromPtrs);
    const result = applyPartialEditPlan(doc, page, run, plan);
    for (const ptr of run.mergedFromPtrs.slice(0, 5))
      expect(x.get(ptr) ?? 0).toBe(0);
    for (const ptr of run.mergedFromPtrs.slice(5))
      expect(x.get(ptr)).toBeCloseTo(-SPACE_PT);
    // Undo reverses the shifts recorded in the journal.
    expect(result.journal.shifted.map((s) => s.ptr)).toEqual(
      run.mergedFromPtrs.slice(5),
    );
    expect(result.newMergedFromBounds[5].x).toBeCloseTo(60 - SPACE_PT);
  });

  it("never closes more than the visible gap", () => {
    const run = perLetterRun("Audit Desk");
    // Objects nearly touching: the gap is narrower than a space.
    run.mergedFromBounds[5] = { x: 9, right: 17 };
    run.mergedFromBounds[4] = { x: 0, right: 8 };
    const plan = planPartialEdit(run, "Audit Desk", "AuditDesk")!;
    const { doc, page, x } = fakeDocAndPage(run.mergedFromPtrs);
    applyPartialEditPlan(doc, page, run, plan);
    expect(x.get(run.mergedFromPtrs[5])).toBeCloseTo(-1);
  });

  it("ignores a space carried inside a text object", () => {
    const run = perLetterRun("Audit Desk");
    // "t " as one object: deleting its space is a modify of that object.
    run.mergedFromTexts[4] = "t ";
    const plan = planPartialEdit(run, "Audit Desk", "AuditDesk");
    expect(plan?.ghostGaps).toEqual([]);
  });

  it("leaves the gap to the deleted object's advance when the word before it goes too", () => {
    const run = perLetterRun("Audit Desk");
    const plan = planPartialEdit(run, "Audit Desk", "AudiDesk");
    expect(plan?.ghostGaps).toEqual([]);
  });
});
