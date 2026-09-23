import { afterEach, describe, expect, it, vi } from "vitest";

import {
  lossyEncodeOptions,
  resetCanvasEncodingProbe,
} from "@app/utils/canvasImageEncoding";

/** An engine that can't encode a format returns PNG instead of throwing, so
 *  only the returned Blob's `type` reveals what happened. */

/** Stand in for OffscreenCanvas, honouring only the given MIME types. */
function stubOffscreenCanvas(honoured: string[]): void {
  class FakeOffscreenCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}

    getContext() {
      return { fillStyle: "", fillRect: () => {} };
    }

    convertToBlob({ type }: { type: string }) {
      // Per spec: an unsupported type silently serialises as PNG.
      const actual = honoured.includes(type) ? type : "image/png";
      return Promise.resolve(new Blob([new Uint8Array([0])], { type: actual }));
    }
  }
  vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetCanvasEncodingProbe();
});

describe("lossyEncodeOptions", () => {
  it("uses WebP when the engine really encodes it", async () => {
    stubOffscreenCanvas(["image/webp", "image/jpeg", "image/png"]);
    await expect(lossyEncodeOptions()).resolves.toEqual({
      type: "image/webp",
      quality: 0.85,
    });
  });

  it("falls back to JPEG when a WebP request silently yields PNG", async () => {
    // WebKit's actual behaviour: no WebP encoder, no error either.
    stubOffscreenCanvas(["image/jpeg", "image/png"]);
    await expect(lossyEncodeOptions()).resolves.toEqual({
      type: "image/jpeg",
      quality: 0.85,
    });
  });

  it("falls back to PNG when no lossy format is honoured", async () => {
    stubOffscreenCanvas(["image/png"]);
    await expect(lossyEncodeOptions()).resolves.toEqual({
      type: "image/png",
      quality: 0.85,
    });
  });

  it("passes the caller's quality through", async () => {
    stubOffscreenCanvas(["image/webp", "image/png"]);
    await expect(lossyEncodeOptions(0.5)).resolves.toEqual({
      type: "image/webp",
      quality: 0.5,
    });
  });

  it("probes once and reuses the answer", async () => {
    stubOffscreenCanvas(["image/webp", "image/png"]);
    const spy = vi.spyOn(
      (globalThis as unknown as { OffscreenCanvas: { prototype: object } })
        .OffscreenCanvas.prototype as { convertToBlob: () => unknown },
      "convertToBlob",
    );
    await lossyEncodeOptions();
    const afterFirst = spy.mock.calls.length;
    await lossyEncodeOptions();
    expect(spy.mock.calls.length).toBe(afterFirst);
  });

  it("returns PNG where there is no OffscreenCanvas at all", async () => {
    vi.stubGlobal("OffscreenCanvas", undefined);
    await expect(lossyEncodeOptions()).resolves.toEqual({
      type: "image/png",
      quality: 0.85,
    });
  });
});
