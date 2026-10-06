import { describe, it, expect } from "vitest";
import type { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import {
  headerDiffers,
  type StyledCell,
  styleOfCells,
} from "@app/tools/pdfTextEditor/util/tableStyle";

// A cell whose text spans [left, right] inside a 100pt-wide cell at x=0.
function cell(
  left: number,
  right: number,
  extra: Partial<TextRun> = {},
  cellX = 0,
  cellWidth = 100,
): StyledCell {
  const run = {
    id: `r${left}-${right}`,
    fontId: "base14:Helvetica",
    fontSize: 10,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    bounds: { x: left, y: 0, width: right - left, height: 10 },
    ...extra,
  } as unknown as TextRun;
  return {
    run,
    rect: { x: cellX, y: 0, width: cellWidth, height: 12 },
    left,
    right,
  };
}

describe("styleOfCells", () => {
  it("returns null when the column has no text", () => {
    expect(styleOfCells([])).toBeNull();
  });

  it("reads a left-aligned column from its shared left edge", () => {
    const style = styleOfCells([cell(3, 40), cell(3, 22), cell(3, 61)]);
    expect(style?.align).toBe("left");
  });

  it("reads a right-aligned column from its shared right edge", () => {
    // Varying lefts, one right edge - the numeric-column case.
    const style = styleOfCells([cell(60, 97), cell(75, 97), cell(52, 97)]);
    expect(style?.align).toBe("right");
  });

  it("reads a centred column", () => {
    const style = styleOfCells([cell(40, 60), cell(35, 65), cell(45, 55)]);
    expect(style?.align).toBe("center");
  });

  it("guesses a lone entry's alignment from the edge it sits nearest", () => {
    expect(styleOfCells([cell(80, 97)])?.align).toBe("right");
    expect(styleOfCells([cell(3, 20)])?.align).toBe("left");
  });

  it("takes the median size and the most common face and colour", () => {
    const red = { r: 200, g: 0, b: 0, a: 255 };
    const style = styleOfCells([
      cell(3, 40, { fontSize: 8, fill: red }),
      cell(3, 40, { fontSize: 12, fill: red }),
      cell(3, 40, { fontSize: 12, fill: { r: 0, g: 0, b: 0, a: 255 } }),
    ]);
    expect(style?.fontSize).toBe(12);
    expect(style?.fill).toEqual(red);
  });

  it("maps an arbitrary face onto the nearest standard font", () => {
    const style = styleOfCells([
      cell(3, 40, { fontId: "pdf:12:Georgia-Bold" }),
      cell(3, 40, { fontId: "pdf:12:Georgia-Bold" }),
    ]);
    expect(style?.family).toBe("Times-Bold");
    // The source id is kept so two weights of one face stay distinguishable.
    expect(style?.sourceFontId).toBe("pdf:12:Georgia-Bold");
  });
});

describe("headerDiffers", () => {
  const base = styleOfCells([cell(3, 40), cell(3, 40)])!;

  it("is false without both styles", () => {
    expect(headerDiffers(null, base)).toBe(false);
    expect(headerDiffers(base, null)).toBe(false);
  });

  it("spots a header set in a different font object", () => {
    const header = styleOfCells([
      cell(3, 40, { fontId: "pdf:99:Chrom Sans OTF" }),
      cell(3, 40, { fontId: "pdf:99:Chrom Sans OTF" }),
    ])!;
    // Same resolved family, different font - exactly the substituted-face case.
    expect(header.family).toBe(base.family);
    expect(headerDiffers(header, base)).toBe(true);
  });

  it("spots a bigger or differently coloured header", () => {
    const bigger = { ...base, fontSize: base.fontSize + 3 };
    expect(headerDiffers(bigger, base)).toBe(true);
    const coloured = { ...base, fill: { r: 255, g: 0, b: 0, a: 255 } };
    expect(headerDiffers(coloured, base)).toBe(true);
  });

  it("is false for a header set exactly like the body", () => {
    expect(headerDiffers({ ...base }, base)).toBe(false);
  });
});
