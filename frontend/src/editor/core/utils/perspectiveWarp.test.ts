// @vitest-environment node
import { describe, test, expect } from "vitest";
import type {
  DocumentCorners,
  RgbaImage,
} from "@editor/utils/documentDetection";
import { warpPerspective } from "@editor/utils/perspectiveWarp";

const CELLS = 8;
const OUT_W = 160;
const OUT_H = 200;

/** A checkerboard page drawn into `size`² pixels through the given corners, by inverse bilinear lookup. */
function photographedCheckerboard(
  size: number,
  corners: DocumentCorners,
): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let u = 0.5;
      let v = 0.5;
      for (let i = 0; i < 20; i++) {
        const top = {
          x: corners.topLeft.x + (corners.topRight.x - corners.topLeft.x) * u,
          y: corners.topLeft.y + (corners.topRight.y - corners.topLeft.y) * u,
        };
        const bottom = {
          x:
            corners.bottomLeft.x +
            (corners.bottomRight.x - corners.bottomLeft.x) * u,
          y:
            corners.bottomLeft.y +
            (corners.bottomRight.y - corners.bottomLeft.y) * u,
        };
        const px = top.x + (bottom.x - top.x) * v;
        const py = top.y + (bottom.y - top.y) * v;
        const left = {
          x: corners.topLeft.x + (corners.bottomLeft.x - corners.topLeft.x) * v,
          y: corners.topLeft.y + (corners.bottomLeft.y - corners.topLeft.y) * v,
        };
        const right = {
          x:
            corners.topRight.x +
            (corners.bottomRight.x - corners.topRight.x) * v,
          y:
            corners.topRight.y +
            (corners.bottomRight.y - corners.topRight.y) * v,
        };
        u +=
          ((x + 0.5 - px) * (right.x - left.x) +
            (y + 0.5 - py) * (right.y - left.y)) /
          ((right.x - left.x) ** 2 + (right.y - left.y) ** 2);
        v +=
          ((x + 0.5 - px) * (bottom.x - top.x) +
            (y + 0.5 - py) * (bottom.y - top.y)) /
          ((bottom.x - top.x) ** 2 + (bottom.y - top.y) ** 2);
      }
      const o = (y * size + x) * 4;
      const onPage = u >= 0 && u <= 1 && v >= 0 && v <= 1;
      const dark = (Math.floor(u * CELLS) + Math.floor(v * CELLS)) % 2 === 1;
      const value = !onPage ? 128 : dark ? 20 : 235;
      data[o] = value;
      data[o + 1] = value;
      data[o + 2] = value;
      data[o + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

describe("warpPerspective", () => {
  test("straightens a page that was drawn in a parallelogram", () => {
    const corners: DocumentCorners = {
      topLeft: { x: 60, y: 40 },
      topRight: { x: 300, y: 70 },
      bottomRight: { x: 330, y: 360 },
      bottomLeft: { x: 90, y: 330 },
    };
    const warped = warpPerspective(
      photographedCheckerboard(400, corners),
      corners,
      OUT_W,
      OUT_H,
    );
    expect(warped).not.toBeNull();
    let wrong = 0;
    for (let row = 0; row < CELLS; row++) {
      for (let col = 0; col < CELLS; col++) {
        const x = Math.round(((col + 0.5) * OUT_W) / CELLS);
        const y = Math.round(((row + 0.5) * OUT_H) / CELLS);
        const value = warped!.data[(y * OUT_W + x) * 4];
        const expectDark = (row + col) % 2 === 1;
        if (expectDark ? value > 60 : value < 190) wrong++;
      }
    }
    expect(wrong).toBe(0);
  });

  test("fills points that map outside the source with opaque black", () => {
    const source: RgbaImage = {
      data: new Uint8ClampedArray(10 * 10 * 4).fill(255),
      width: 10,
      height: 10,
    };
    const corners: DocumentCorners = {
      topLeft: { x: -10, y: -10 },
      topRight: { x: 20, y: -10 },
      bottomRight: { x: 20, y: 20 },
      bottomLeft: { x: -10, y: 20 },
    };
    const warped = warpPerspective(source, corners, 30, 30)!;
    expect(Array.from(warped.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    const centre = (15 * 30 + 15) * 4;
    expect(Array.from(warped.data.slice(centre, centre + 4))).toEqual([
      255, 255, 255, 255,
    ]);
  });

  test("returns null for collinear corners", () => {
    const source: RgbaImage = {
      data: new Uint8ClampedArray(4 * 4 * 4),
      width: 4,
      height: 4,
    };
    const line: DocumentCorners = {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 1, y: 1 },
      bottomRight: { x: 2, y: 2 },
      bottomLeft: { x: 3, y: 3 },
    };
    expect(warpPerspective(source, line, 10, 10)).toBeNull();
  });
});
