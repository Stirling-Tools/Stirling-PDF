import { describe, expect, it } from "vitest";
import {
  sampleRunBackground,
  toOpaqueCss,
} from "@app/tools/pdfTextEditor/v2/util/canvasBackground";

type Pixel = [number, number, number];

function stubCanvas(
  width: number,
  height: number,
  pixelAt: (x: number, y: number) => Pixel,
): HTMLCanvasElement {
  const ctx = {
    getImageData: (sx: number, sy: number, sw: number, sh: number) => {
      const data = new Uint8ClampedArray(sw * sh * 4);
      for (let y = 0; y < sh; y += 1) {
        for (let x = 0; x < sw; x += 1) {
          const [r, g, b] = pixelAt(sx + x, sy + y);
          const off = (y * sw + x) * 4;
          data[off] = r;
          data[off + 1] = g;
          data[off + 2] = b;
          data[off + 3] = 255;
        }
      }
      return { data };
    },
  };
  return {
    width,
    height,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
}

const RECT = { x: 10, y: 10, width: 30, height: 20 };

describe("sampleRunBackground", () => {
  it("returns pure white for a white page", () => {
    const canvas = stubCanvas(100, 100, () => [255, 255, 255]);
    expect(sampleRunBackground(canvas, RECT)).toEqual({
      r: 255,
      g: 255,
      b: 255,
    });
  });

  it("serialises that white as an opaque rgb() string", () => {
    const canvas = stubCanvas(100, 100, () => [255, 255, 255]);
    expect(toOpaqueCss(sampleRunBackground(canvas, RECT)!)).toBe(
      "rgb(255, 255, 255)",
    );
  });

  it("returns the exact colour of a flat coloured page", () => {
    const canvas = stubCanvas(100, 100, () => [183, 28, 28]);
    expect(sampleRunBackground(canvas, RECT)).toEqual({ r: 183, g: 28, b: 28 });
  });

  it("averages the real pixels of the winning bucket, rounding to integers", () => {
    const canvas = stubCanvas(100, 100, (_x, y) =>
      y % 2 === 0 ? [250, 250, 250] : [255, 255, 255],
    );
    expect(sampleRunBackground(canvas, RECT)).toEqual({
      r: 253,
      g: 253,
      b: 253,
    });
  });

  it("ignores a minority colour in the sampled strips", () => {
    const canvas = stubCanvas(100, 100, (x) =>
      x < 14 ? [0, 0, 0] : [240, 200, 100],
    );
    expect(sampleRunBackground(canvas, RECT)).toEqual({
      r: 240,
      g: 200,
      b: 100,
    });
  });

  it("returns null for a degenerate rect", () => {
    const canvas = stubCanvas(100, 100, () => [255, 255, 255]);
    expect(sampleRunBackground(canvas, { ...RECT, width: 0 })).toBeNull();
    expect(sampleRunBackground(canvas, { ...RECT, height: 0 })).toBeNull();
  });

  it("returns null when the canvas cannot be read", () => {
    const noCtx = { width: 100, height: 100, getContext: () => null };
    expect(
      sampleRunBackground(noCtx as unknown as HTMLCanvasElement, RECT),
    ).toBeNull();
    const tainted = {
      width: 100,
      height: 100,
      getContext: () => ({
        getImageData: () => {
          throw new Error("tainted");
        },
      }),
    };
    expect(
      sampleRunBackground(tainted as unknown as HTMLCanvasElement, RECT),
    ).toBeNull();
  });
});
