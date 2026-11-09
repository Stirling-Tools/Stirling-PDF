// @vitest-environment node
import { describe, test, expect } from "vitest";
import {
  detectDocument,
  refineCorners,
  type DocumentCorners,
  type Point,
  type RgbaImage,
} from "@editor/utils/documentDetection";

type Rgb = [number, number, number];

interface Scene {
  width: number;
  height: number;
  background: (x: number, y: number) => Rgb;
  page?: { corners: DocumentCorners; colour: Rgb; textBlock?: boolean };
  cable?: { from: Point; to: Point; thickness: number };
}

function seededNoise(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff - 0.5;
  };
}

function insideQuad(corners: DocumentCorners, x: number, y: number): boolean {
  const q = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ];
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
    if (c === 0) continue;
    if (sign === 0) sign = c;
    else if (c !== sign) return false;
  }
  return true;
}

function bilinear(corners: DocumentCorners, u: number, v: number): Point {
  const top = {
    x: corners.topLeft.x + (corners.topRight.x - corners.topLeft.x) * u,
    y: corners.topLeft.y + (corners.topRight.y - corners.topLeft.y) * u,
  };
  const bottom = {
    x:
      corners.bottomLeft.x + (corners.bottomRight.x - corners.bottomLeft.x) * u,
    y:
      corners.bottomLeft.y + (corners.bottomRight.y - corners.bottomLeft.y) * u,
  };
  return {
    x: top.x + (bottom.x - top.x) * v,
    y: top.y + (bottom.y - top.y) * v,
  };
}

/** Renders a scene with 4× supersampling so edges are anti-aliased like a camera's. */
function render(scene: Scene, seed = 7): RgbaImage {
  const { width, height } = scene;
  const noise = seededNoise(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  const textBlock = scene.page?.textBlock
    ? {
        topLeft: bilinear(scene.page.corners, 0.15, 0.12),
        topRight: bilinear(scene.page.corners, 0.85, 0.12),
        bottomRight: bilinear(scene.page.corners, 0.85, 0.85),
        bottomLeft: bilinear(scene.page.corners, 0.15, 0.85),
      }
    : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sum: Rgb = [0, 0, 0];
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = x + 0.25 + sx * 0.5;
          const py = y + 0.25 + sy * 0.5;
          let colour = scene.background(px, py);
          if (scene.page && insideQuad(scene.page.corners, px, py)) {
            colour = scene.page.colour;
            if (
              textBlock &&
              insideQuad(textBlock, px, py) &&
              Math.floor(py / 2) % 2 === 0
            ) {
              colour = [60, 60, 70];
            }
          }
          if (scene.cable) {
            const { from, to, thickness } = scene.cable;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const distance =
              Math.abs(dy * px - dx * py + to.x * from.y - to.y * from.x) /
              Math.hypot(dx, dy);
            if (distance < thickness / 2) colour = [25, 25, 25];
          }
          for (let c = 0; c < 3; c++) sum[c] += colour[c];
        }
      }
      const n = noise() * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) data[o + c] = sum[c] / 4 + n;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

function meanCornerError(
  found: DocumentCorners,
  expected: DocumentCorners,
): number {
  const keys = ["topLeft", "topRight", "bottomRight", "bottomLeft"] as const;
  return (
    keys.reduce(
      (sum, k) =>
        sum +
        Math.hypot(found[k].x - expected[k].x, found[k].y - expected[k].y),
      0,
    ) / 4
  );
}

const woodGrain = (x: number, y: number): Rgb => {
  const grain =
    12 * Math.sin(y * 0.9 + Math.sin(x * 0.05) * 3) +
    6 * Math.sin(x * 0.31 + y * 0.2);
  return [196 + grain, 140 + grain * 0.8, 112 + grain * 0.6];
};

const skewedPage: DocumentCorners = {
  topLeft: { x: 78.4, y: 22.6 },
  topRight: { x: 168.2, y: 27.1 },
  bottomRight: { x: 176.7, y: 118.3 },
  bottomLeft: { x: 66.9, y: 112.8 },
};

describe("detectDocument", () => {
  test("finds a perspective-skewed page on wood grain to within a pixel", () => {
    const image = render({
      width: 240,
      height: 135,
      background: woodGrain,
      page: { corners: skewedPage, colour: [236, 236, 242] },
    });
    const found = detectDocument(image);
    expect(found).not.toBeNull();
    expect(meanCornerError(found!, skewedPage)).toBeLessThan(1);
  });

  test("finds white paper on a white desk from its colour cast alone", () => {
    const image = render({
      width: 240,
      height: 135,
      background: () => [232, 226, 218],
      page: { corners: skewedPage, colour: [234, 236, 240] },
    });
    const found = detectDocument(image);
    expect(found).not.toBeNull();
    expect(meanCornerError(found!, skewedPage)).toBeLessThan(1.5);
  });

  test("outlines the page rather than the block of text printed on it", () => {
    const image = render({
      width: 240,
      height: 135,
      background: () => [120, 110, 100],
      page: { corners: skewedPage, colour: [236, 236, 242], textBlock: true },
    });
    const found = detectDocument(image);
    expect(found).not.toBeNull();
    expect(meanCornerError(found!, skewedPage)).toBeLessThan(1.5);
  });

  test("keeps the page when a cable crosses it", () => {
    const image = render({
      width: 240,
      height: 135,
      background: () => [214, 204, 190],
      page: { corners: skewedPage, colour: [240, 240, 244] },
      cable: { from: { x: 10, y: 20 }, to: { x: 230, y: 125 }, thickness: 3 },
    });
    const found = detectDocument(image);
    expect(found).not.toBeNull();
    expect(meanCornerError(found!, skewedPage)).toBeLessThan(2);
  });

  test("returns null for an empty table", () => {
    expect(
      detectDocument(
        render({ width: 240, height: 135, background: woodGrain }),
      ),
    ).toBeNull();
  });

  test("returns corners clockwise from the top-left", () => {
    const found = detectDocument(
      render({
        width: 240,
        height: 135,
        background: () => [80, 80, 90],
        page: { corners: skewedPage, colour: [236, 236, 242] },
      }),
    );
    expect(found).not.toBeNull();
    const { topLeft, topRight, bottomRight, bottomLeft } = found!;
    expect(topLeft.x).toBeLessThan(topRight.x);
    expect(bottomLeft.x).toBeLessThan(bottomRight.x);
    expect(topLeft.y).toBeLessThan(bottomLeft.y);
    expect(topRight.y).toBeLessThan(bottomRight.y);
  });
});

describe("refineCorners", () => {
  const scale = 4;
  const large = (c: DocumentCorners): DocumentCorners => ({
    topLeft: { x: c.topLeft.x * scale, y: c.topLeft.y * scale },
    topRight: { x: c.topRight.x * scale, y: c.topRight.y * scale },
    bottomRight: { x: c.bottomRight.x * scale, y: c.bottomRight.y * scale },
    bottomLeft: { x: c.bottomLeft.x * scale, y: c.bottomLeft.y * scale },
  });
  const truth = large(skewedPage);
  const image = render({
    width: 240 * scale,
    height: 135 * scale,
    background: () => [90, 80, 70],
    page: { corners: truth, colour: [236, 236, 242] },
  });

  test("pulls corners that are several pixels off back onto the page edges", () => {
    const off: DocumentCorners = {
      topLeft: { x: truth.topLeft.x + 4, y: truth.topLeft.y - 3 },
      topRight: { x: truth.topRight.x - 3, y: truth.topRight.y + 4 },
      bottomRight: { x: truth.bottomRight.x + 3, y: truth.bottomRight.y + 3 },
      bottomLeft: { x: truth.bottomLeft.x - 4, y: truth.bottomLeft.y - 2 },
    };
    expect(meanCornerError(refineCorners(image, off, 8), truth)).toBeLessThan(
      0.1,
    );
  });

  test("leaves corners alone where there is no edge to snap to", () => {
    const blank = render({
      width: 240,
      height: 135,
      background: () => [128, 128, 128],
    });
    expect(refineCorners(blank, skewedPage, 3)).toBe(skewedPage);
  });
});
