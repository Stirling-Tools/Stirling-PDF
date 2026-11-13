// @vitest-environment node
import { describe, expect, test, vi } from "vitest";

vi.mock(
  "@editor/tools/pdfTextEditor/commands/scanStyle",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    placeText: vi.fn(() => [11, 12]),
  }),
);

import {
  drawInFont,
  type Canvas,
} from "@editor/tools/pdfTextEditor/commands/scanPaint";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";

describe("drawing typed scan text in a font", () => {
  test("tags the drawn text with the block's tags, as it replaces the tagged OCR words", () => {
    const marked: Array<[number, string]> = [];
    const module = {
      FPDFPageObj_CountMarks: () => 0,
      FPDFPageObj_AddMark: (ptr: number, name: string) => {
        marked.push([ptr, name]);
        return 1;
      },
      FPDFPageObjMark_SetIntParam: () => true,
    };
    const canvas: Canvas = {
      doc: { module, docPtr: 1 } as unknown as EditorDocument,
      page: { pagePtr: 2 } as unknown as Page,
      tagMarks: [{ name: "P", mcid: 3 }],
      created: [],
      textPtrs: [],
      searchableFontPtr: 0,
    };
    drawInFont(
      canvas,
      "Mary",
      10,
      10,
      100,
      {
        family: "Helvetica",
        fontSize: 12,
        stretch: 1,
        ink: { r: 0, g: 0, b: 0, a: 255 },
        weight: 0,
        hollow: 0,
        softness: 0,
      },
      Infinity,
    );
    expect(marked).toEqual([
      [11, "P"],
      [12, "P"],
    ]);
    expect(canvas.textPtrs).toEqual([11, 12]);
  });
});
