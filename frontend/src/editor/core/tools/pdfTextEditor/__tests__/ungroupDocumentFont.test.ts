import { describe, expect, it } from "vitest";
import { UngroupParagraphCommand } from "@editor/tools/pdfTextEditor/commands/UngroupParagraphCommand";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

function paragraphInChangedFont(): Page {
  const page = new Page({ index: 0, pagePtr: 1, width: 200, height: 200 });
  const rep = new TextRun({
    id: "p",
    pageIndex: 0,
    pdfiumObjPtr: 11,
    bounds: { x: 10, y: 120, width: 100, height: 30 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 10, f: 140 },
    text: "first\nsecond\nthird",
    fontId: "device:Acme Sans",
    fontSize: 10,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  });
  rep.paragraphMemberPtrs = [11, 12, 13];
  rep.paragraphMemberContainers = [1, 1, 1];
  rep.paragraphMemberFs = [140, 128, 116];
  rep.documentFont = { fontId: "pdf:7:Garamond", subset: true };
  page.setRuns([rep]);
  return page;
}

function fakeDoc(page: Page): EditorDocument {
  return { module: {}, page: () => page } as unknown as EditorDocument;
}

describe("UngroupParagraphCommand document font", () => {
  it("keeps the restore option on every line of a paragraph whose font was changed", () => {
    const page = paragraphInChangedFont();
    new UngroupParagraphCommand({ pageIndex: 0, runId: "p" }).apply(
      fakeDoc(page),
    );

    expect(page.runs.map((r) => r.snapshot().documentFontId)).toEqual([
      "pdf:7:Garamond",
      "pdf:7:Garamond",
      "pdf:7:Garamond",
    ]);
    expect(page.runs[2].documentFont?.subset).toBe(true);
  });

  it("leaves the paragraph restorable after the ungroup is undone", () => {
    const page = paragraphInChangedFont();
    const doc = fakeDoc(page);
    const cmd = new UngroupParagraphCommand({ pageIndex: 0, runId: "p" });
    cmd.apply(doc);
    cmd.revert(doc);

    expect(page.runs.map((r) => r.snapshot().documentFontId)).toEqual([
      "pdf:7:Garamond",
    ]);
  });
});
