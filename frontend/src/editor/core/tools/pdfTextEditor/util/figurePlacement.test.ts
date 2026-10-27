import { describe, expect, it } from "vitest";
import type { ImageObject } from "@editor/tools/pdfTextEditor/model/ImageObject";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";
import {
  imagesInReadingOrder,
  precedingTaggedMcid,
} from "@editor/tools/pdfTextEditor/util/figurePlacement";

const UPRIGHT = { apply: (x: number, y: number) => ({ x, y }) };

const box = (x: number, y: number, width = 80, height = 10): PageRect => ({
  x,
  y,
  width,
  height,
});
const run = (mcid: number | null, bounds: PageRect) => ({
  bounds,
  tagMarks: mcid === null ? [] : [{ name: "P", mcid }],
});
const image = (mcid: number | null, bounds: PageRect) =>
  ({ bounds, mcid, containerPtr: 0 }) as ImageObject;
const page = (
  runs: ReturnType<typeof run>[],
  images: ImageObject[],
  display = UPRIGHT,
) => ({ runs, images, display }) as unknown as Page;

describe("precedingTaggedMcid", () => {
  it("follows the tagged content closest above the image", () => {
    const target = image(null, box(10, 60, 20, 20));
    const p = page([run(0, box(10, 180)), run(1, box(10, 120))], [target]);
    expect(precedingTaggedMcid(p, target)).toBe(1);
  });

  it("prefers content in the image's column to closer content beside it", () => {
    const target = image(null, box(110, 80, 80, 20));
    const p = page(
      [run(0, box(0, 100, 90)), run(1, box(110, 150, 90))],
      [target],
    );
    expect(precedingTaggedMcid(p, target)).toBe(1);
  });

  it("reads content level with the image and to its left first", () => {
    const target = image(null, box(100, 90, 20, 20));
    const p = page([run(0, box(0, 100, 50))], [target]);
    expect(precedingTaggedMcid(p, target)).toBe(0);
  });

  it("skips untagged content and the image itself", () => {
    const target = image(4, box(10, 60, 20, 20));
    const p = page([run(null, box(10, 120))], [target]);
    expect(precedingTaggedMcid(p, target)).toBeNull();
  });

  it("reads a page as it is displayed", () => {
    const target = image(null, box(10, 60, 20, 20));
    const upsideDown = { apply: (x: number, y: number) => ({ x, y: -y }) };
    const p = page([run(1, box(10, 120))], [target], upsideDown);
    expect(precedingTaggedMcid(p, target)).toBeNull();
  });
});

describe("imagesInReadingOrder", () => {
  it("orders the page's images top to bottom, then left to right", () => {
    const low = image(null, box(10, 20));
    const right = image(null, box(100, 120));
    const left = image(null, box(10, 120));
    expect(imagesInReadingOrder(page([], [low, right, left]))).toEqual([
      left,
      right,
      low,
    ]);
  });
});
