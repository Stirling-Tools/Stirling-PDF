import { describe, expect, it } from "vitest";
import { planPartialEdit } from "@app/tools/pdfTextEditor/commands/partialEdit";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";

// One sub-run per word so the partial path has something to diff against.
function makeRun(text: string): TextRun {
  const run = new TextRun({
    id: "r1",
    pageIndex: 0,
    pdfiumObjPtr: 5,
    bounds: { x: 0, y: 0, width: 100, height: 12 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    text,
    fontId: "pdf:9:Unknown",
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: true,
  });
  run.mergedFromPtrs = [5];
  run.mergedFromTexts = [text];
  run.mergedFromBounds = [{ x: 0, right: 100 }];
  run.mergedFromCharStarts = [0];
  return run;
}

describe("partialEdit cluster guard", () => {
  it("refuses a plan that splits a combining mark from its base", () => {
    // Deleting only the base, keeping the acute, would emit a lone mark.
    const run = makeRun("e\u0301x");
    expect(planPartialEdit(run, "e\u0301x", "\u0301x")).toBeNull();
  });

  it("still allows deleting a whole cluster", () => {
    const run = makeRun("e\u0301x");
    const plan = planPartialEdit(run, "e\u0301x", "x");
    expect(plan).not.toBeNull();
  });

  it("refuses a plan that splits a ZWJ sequence", () => {
    const run = makeRun("\u{1F468}\u200D\u{1F469}x");
    const next = "\u{1F468}\u200Dx";
    expect(planPartialEdit(run, run.text, next)).toBeNull();
  });

  it("allows editing a single-codepoint ligature atomically", () => {
    const run = makeRun("\uFB01ne");
    const plan = planPartialEdit(run, "\uFB01ne", "ne");
    expect(plan).not.toBeNull();
  });

  it("keeps ordinary edits on the partial path", () => {
    const run = makeRun("The Free Adobe Acrobat Alternative");
    const plan = planPartialEdit(
      run,
      run.text,
      "The Free Adobe Acrobat AlternativeZ",
    );
    expect(plan).not.toBeNull();
  });
});
