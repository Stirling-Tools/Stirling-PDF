import { afterEach, describe, expect, it, vi } from "vitest";

import { getCroppedImage } from "@app/utils/cropImage";

interface DrawCall {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

function stubImageThatLoads(): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);
}

function stubCanvas(): { canvas: HTMLCanvasElement; draws: DrawCall[] } {
  const draws: DrawCall[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      imageSmoothingQuality: "low",
      drawImage: (
        _image: unknown,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number,
        dw: number,
        dh: number,
      ) => {
        draws.push({ sx, sy, sw, sh, dx, dy, dw, dh });
      },
    }),
    toBlob: (callback: (blob: Blob | null) => void, type: string) => {
      callback(new Blob([new Uint8Array([0])], { type }));
    },
  } as unknown as HTMLCanvasElement;

  vi.spyOn(document, "createElement").mockImplementation(() => canvas);
  return { canvas, draws };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getCroppedImage", () => {
  it("caps the output at a 512px longest edge", async () => {
    stubImageThatLoads();
    const { canvas, draws } = stubCanvas();

    await getCroppedImage("blob:source", {
      x: 100,
      y: 50,
      width: 2000,
      height: 1000,
    });

    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(256);
    expect(draws).toEqual([
      { sx: 100, sy: 50, sw: 2000, sh: 1000, dx: 0, dy: 0, dw: 512, dh: 256 },
    ]);
  });

  it("leaves a crop smaller than the cap at its natural size", async () => {
    stubImageThatLoads();
    const { canvas, draws } = stubCanvas();

    await getCroppedImage("blob:source", {
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    });

    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(200);
    expect(draws[0]?.dw).toBe(300);
    expect(draws[0]?.dh).toBe(200);
  });

  it("returns a PNG blob", async () => {
    stubImageThatLoads();
    stubCanvas();

    const blob = await getCroppedImage("blob:source", {
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    });

    expect(blob.type).toBe("image/png");
  });
});
