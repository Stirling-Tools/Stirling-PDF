import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { getToolsCore, type ColorAdjustments } from "@app/services/toolsCore";
import {
  stubWasmFetch,
  toolsCoreWasmBuilt,
} from "@app/tests/helpers/toolsCoreWasm";

const NEUTRAL: ColorAdjustments = {
  contrast: 100,
  brightness: 100,
  saturation: 100,
  red: 100,
  green: 100,
  blue: 100,
};

describe.skipIf(!toolsCoreWasmBuilt)("ToolsCore.adjustRgba", () => {
  beforeAll(stubWasmFetch);

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test("leaves pixels unchanged for neutral adjustments", async () => {
    const pixels = new Uint8ClampedArray([200, 100, 50, 255, 0, 64, 255, 128]);

    (await getToolsCore()).adjustRgba(pixels, NEUTRAL);

    expect(Array.from(pixels)).toEqual([200, 100, 50, 255, 0, 64, 255, 128]);
  });

  test("adjusts colour channels in RGBA order and keeps alpha", async () => {
    const pixels = new Uint8ClampedArray([200, 100, 50, 77]);

    (await getToolsCore()).adjustRgba(pixels, { ...NEUTRAL, contrast: 200 });

    expect(Array.from(pixels)).toEqual([255, 72, 0, 77]);
  });

  test("handles a thumbnail-sized buffer", async () => {
    const pixels = new Uint8ClampedArray(300 * 400 * 4).fill(180);

    (await getToolsCore()).adjustRgba(pixels, { ...NEUTRAL, brightness: 0 });

    expect(pixels.filter((_, i) => i % 4 !== 3).every((v) => v === 0)).toBe(
      true,
    );
    expect(pixels.filter((_, i) => i % 4 === 3).every((v) => v === 180)).toBe(
      true,
    );
  });

  test("reports the library's reason for a malformed buffer", async () => {
    const tools = await getToolsCore();

    expect(() => tools.adjustRgba(new Uint8ClampedArray(6), NEUTRAL)).toThrow(
      "6 bytes is not a whole number of RGBA pixels",
    );
  });
});
