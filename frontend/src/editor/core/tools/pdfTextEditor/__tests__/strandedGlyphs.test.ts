// @vitest-environment node
import { describe, it, expect } from "vitest";
import { planPartialEdit } from "@editor/tools/pdfTextEditor/commands/partialEdit";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";

function glyphPerObjectRun(text: string): TextRun {
  const run = new TextRun({
    id: "p0-t0",
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: text.length * 6, height: 14 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 800 },
    text,
    fontId: "pdf:1:Unknown",
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    pdfiumObjPtr: 0,
  });
  run.mergedFromPtrs = [...text].map((_, i) => 300 + i);
  run.mergedFromTexts = [...text];
  run.mergedFromBounds = [...text].map((_, i) => ({
    x: i * 6,
    right: i * 6 + 5,
  }));
  run.mergedFromCharStarts = [...text].map((_, i) => i);
  return run;
}

function keptText(run: TextRun, prev: string, next: string): string {
  const plan = planPartialEdit(run, prev, next);
  if (!plan) throw new Error("no plan");
  return plan.subRunStatus
    .map((status, i) => (status === "all-kept" ? run.mergedFromTexts[i] : "_"))
    .join("");
}

describe("planPartialEdit leaves no old glyph inside a new word", () => {
  it("retypes a letter of a deleted word that the diff matched into the new one", () => {
    const run = glyphPerObjectRun("Downloads");
    expect(keptText(run, "Downloads", "Xk Quixotic")).not.toMatch(/[a-z]/i);
  });

  it("retypes a letter left stranded once its neighbours are retyped", () => {
    const run = glyphPerObjectRun("Quarterly report");
    expect(
      keptText(run, "Quarterly report", "Annual summary").replace(/_/g, ""),
    ).not.toMatch(/l/);
  });

  it("keeps the letters around a one-letter typo fix", () => {
    const run = glyphPerObjectRun("cat");
    expect(keptText(run, "cat", "cut")).toBe("c_t");
  });

  it("keeps whole words the edit does not touch", () => {
    const run = glyphPerObjectRun("Free Adobe Alternative");
    expect(
      keptText(run, "Free Adobe Alternative", "Free Quixotic Alternative"),
    ).toBe("Free _____ Alternative");
  });
});
