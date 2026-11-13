import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@editor/tools/pdfTextEditor/commands/editTextHelpers",
  async (orig) => ({
    ...(await orig<object>()),
    removeMemberPtrs: vi.fn(),
    emitRunLines: vi.fn(() => [
      { ptrs: [501], text: "Hello", texts: ["Hello"], x: 10, y: 140 },
    ]),
  }),
);
vi.mock("@editor/tools/pdfTextEditor/commands/runTags", () => ({
  readRunTags: () => [],
}));
vi.mock("@editor/tools/pdfTextEditor/commands/scanTextEdit", () => ({
  setScanOverride: () => null,
}));
vi.mock("@editor/tools/pdfTextEditor/util/deviceFontEmbed", () => ({
  deviceFontEmitCount: () => 0,
}));

import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";

function runInChangedFont(): { page: Page; run: TextRun } {
  const page = new Page({ index: 0, pagePtr: 1, width: 200, height: 200 });
  const run = new TextRun({
    id: "r",
    pageIndex: 0,
    pdfiumObjPtr: 11,
    bounds: { x: 10, y: 130, width: 60, height: 12 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 10, f: 140 },
    text: "Hello",
    fontId: "device:Acme Sans",
    fontSize: 10,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  });
  run.documentFont = { fontId: "pdf:7:Garamond", subset: true };
  page.setRuns([run]);
  return { page, run };
}

function fakeDoc(page: Page, emittedFont: number) {
  const module = {
    FPDFTextObj_GetFont: vi.fn(() => emittedFont),
    FPDFPage_RemoveObject: vi.fn(() => true),
    FPDFPageObj_Destroy: vi.fn(),
    FPDFPage_InsertObject: vi.fn(),
  };
  const doc = { module, page: () => page } as unknown as EditorDocument;
  return { doc, module };
}

function restore(doc: EditorDocument) {
  new SetFontFamilyCommand({
    pageIndex: 0,
    runId: "r",
    nextFamily: "pdf:7:Garamond",
  }).apply(doc);
}

describe("SetFontFamilyCommand restoring the document font", () => {
  it("marks the run restored when the new text uses the saved font", () => {
    const { page, run } = runInChangedFont();
    restore(fakeDoc(page, 7).doc);

    expect(run.fontId).toBe("pdf:7:Garamond");
    expect(run.documentFont).toBeNull();
  });

  it("keeps the run as it was when only a fallback font could draw it", () => {
    const { page, run } = runInChangedFont();
    const { doc, module } = fakeDoc(page, 99);
    restore(doc);

    expect(run.fontId).toBe("device:Acme Sans");
    expect(run.documentFont).toEqual({
      fontId: "pdf:7:Garamond",
      subset: true,
    });
    expect(run.pdfiumObjPtr).toBe(11);
    expect(module.FPDFPage_RemoveObject).toHaveBeenCalledWith(1, 501);
    expect(module.FPDFPage_InsertObject).toHaveBeenCalledWith(1, 11);
  });
});
