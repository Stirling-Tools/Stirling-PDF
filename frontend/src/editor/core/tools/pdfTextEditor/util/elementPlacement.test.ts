import { describe, expect, it } from "vitest";
import type { ImageObject } from "@editor/tools/pdfTextEditor/model/ImageObject";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import type { PageRect } from "@editor/tools/pdfTextEditor/types";
import {
  precedingTaggedMcid,
  taggedContentInReadingOrder,
} from "@editor/tools/pdfTextEditor/util/elementPlacement";

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
/** An image as the content it draws, the way an added element's content is placed. */
const placed = (img: ImageObject) => ({ mcid: img.mcid!, bounds: img.bounds });
const page = (
  runs: ReturnType<typeof run>[],
  images: ImageObject[],
  display = UPRIGHT,
) => ({ runs, images, display }) as unknown as Page;

describe("precedingTaggedMcid", () => {
  it("follows the tagged content closest above the image", () => {
    const target = image(9, box(10, 60, 20, 20));
    const p = page([run(0, box(10, 180)), run(1, box(10, 120))], [target]);
    expect(precedingTaggedMcid(p, placed(target))).toBe(1);
  });

  it("prefers content in the image's column to closer content beside it", () => {
    const target = image(9, box(110, 80, 80, 20));
    const p = page(
      [run(0, box(0, 100, 90)), run(1, box(110, 150, 90))],
      [target],
    );
    expect(precedingTaggedMcid(p, placed(target))).toBe(1);
  });

  it("reads content level with the image and to its left first", () => {
    const target = image(9, box(100, 90, 20, 20));
    const p = page([run(0, box(0, 100, 50))], [target]);
    expect(precedingTaggedMcid(p, placed(target))).toBe(0);
  });

  it("skips untagged content and the image itself", () => {
    const target = image(4, box(10, 60, 20, 20));
    const p = page([run(null, box(10, 120))], [target]);
    expect(precedingTaggedMcid(p, placed(target))).toBeNull();
  });

  it("reads a page as it is displayed", () => {
    const target = image(9, box(10, 60, 20, 20));
    const upsideDown = { apply: (x: number, y: number) => ({ x, y: -y }) };
    const p = page([run(1, box(10, 120))], [target], upsideDown);
    expect(precedingTaggedMcid(p, placed(target))).toBeNull();
  });
});

describe("taggedContentInReadingOrder", () => {
  it("orders tagged text and images top to bottom, then left to right", () => {
    const low = image(2, box(10, 20));
    const right = image(1, box(100, 120));
    const p = page(
      [run(0, box(10, 120)), run(null, box(10, 160))],
      [low, right],
    );
    expect(taggedContentInReadingOrder(p).map((c) => c.mcid)).toEqual([
      0, 1, 2,
    ]);
  });
});
