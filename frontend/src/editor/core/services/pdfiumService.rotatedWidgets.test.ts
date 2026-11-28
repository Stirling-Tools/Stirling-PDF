/**
 * Widget appearance bitmaps against the real PDFium WASM, on pages with /Rotate
 * and a non-zero CropBox origin. Bitmaps must come out in unrotated page space.
 */
import { describe, expect, it, vi, beforeAll } from "vitest";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFArray,
  PDFString,
  type PDFContext,
  type PDFRef,
} from "@cantoo/pdf-lib";

vi.mock("@editor/services/wasmPrecompiler", async () => {
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const path = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  return {
    pdfiumWasmModulePromise: WebAssembly.compile(readFileSync(path)),
    startEagerWasmCompilation: () => {},
    pdfiumWasmUrl: "file://pdfium.wasm",
  };
});

import {
  renderButtonFieldAppearances,
  renderSignatureFieldAppearances,
  withUnrotatedPage,
} from "@editor/services/pdfiumService";

class TestImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

beforeAll(() => {
  if (typeof globalThis.ImageData === "undefined") {
    (globalThis as { ImageData?: unknown }).ImageData = TestImageData;
  }
});

const W = 120;
const H = 60;
const RECT = { x: 100, y: 200 };

// Red top-left quadrant and blue bottom-right quadrant (in the widget's own space).
const AP_CONTENT = `1 0 0 rg 0 ${H / 2} ${W / 2} ${H / 2} re f 0 0 1 rg ${W / 2} 0 ${W / 2} ${H / 2} re f`;

function apStream(context: PDFContext): PDFRef {
  const stream = context.flateStream(AP_CONTENT, {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, W, H],
  });
  return context.register(stream);
}

// CertSignController's shape: upright in a reader-sized BBox, turned back by a quadrant /Matrix.
function backendApStream(context: PDFContext, rotate: number): PDFRef {
  const [w, h] = rotate % 180 ? [H, W] : [W, H];
  const [cos, sin] = [
    Math.round(Math.cos((rotate * Math.PI) / 180)),
    Math.round(Math.sin((rotate * Math.PI) / 180)),
  ];
  const content = `1 0 0 rg 0 ${h / 2} ${w / 2} ${h / 2} re f 0 0 1 rg ${w / 2} 0 ${w / 2} ${h / 2} re f`;
  const stream = context.flateStream(content, {
    Type: "XObject",
    Subtype: "Form",
    BBox: [0, 0, w, h],
    Matrix: [cos, sin, -sin, cos, 0, 0],
  });
  return context.register(stream);
}

async function buildPdf(
  fieldType: "Sig" | "Btn",
  rotate: number,
  cropOrigin = { x: 0, y: 0 },
  backendShape = false,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const ctx = doc.context;
  if (rotate) page.node.set(PDFName.of("Rotate"), PDFNumber.of(rotate));
  if (cropOrigin.x || cropOrigin.y) {
    page.node.set(
      PDFName.of("CropBox"),
      ctx.obj([cropOrigin.x, cropOrigin.y, 600, 800]),
    );
  }
  const left = RECT.x + cropOrigin.x;
  const bottom = RECT.y + cropOrigin.y;
  const widget = ctx.obj({
    Type: "Annot",
    Subtype: "Widget",
    FT: fieldType,
    T: PDFString.of("field1"),
    F: 4,
    Rect: [left, bottom, left + W, bottom + H],
    P: page.ref,
    AP: { N: backendShape ? backendApStream(ctx, rotate) : apStream(ctx) },
    ...(fieldType === "Btn" ? { Ff: 65536 } : {}),
  });
  const widgetRef = ctx.register(widget);
  page.node.set(PDFName.of("Annots"), ctx.obj([widgetRef]));
  const fields = PDFArray.withContext(ctx);
  fields.push(widgetRef);
  doc.catalog.set(PDFName.of("AcroForm"), ctx.obj({ Fields: fields }));
  return doc.save({ useObjectStreams: false });
}

type Pixel = [number, number, number, number];

function pixelAt(img: ImageData, fx: number, fy: number): Pixel {
  const x = Math.floor(fx * img.width);
  const y = Math.floor(fy * img.height);
  const i = (y * img.width + x) * 4;
  return Array.from(img.data.slice(i, i + 4)) as Pixel;
}

function expectUnrotatedQuadrants(img: ImageData | null): void {
  expect(img).not.toBeNull();
  if (!img) return;
  expect(img.width).toBe(W);
  expect(img.height).toBe(H);
  const [r1, g1, b1, a1] = pixelAt(img, 0.25, 0.25);
  expect({ r1, g1, b1, a1 }).toMatchObject({ r1: 255, g1: 0, b1: 0, a1: 255 });
  const [r2, g2, b2, a2] = pixelAt(img, 0.75, 0.75);
  expect({ r2, g2, b2, a2 }).toMatchObject({ r2: 0, g2: 0, b2: 255, a2: 255 });
  expect(pixelAt(img, 0.75, 0.25)[3]).toBe(0);
  expect(pixelAt(img, 0.25, 0.75)[3]).toBe(0);
}

// Where a screen-space fraction lands in the unrotated bitmap once <Rotate> turns it clockwise.
function unrotatedFraction(
  rotate: number,
  sx: number,
  sy: number,
): [number, number] {
  switch (rotate) {
    case 90:
      return [sy, 1 - sx];
    case 180:
      return [1 - sx, 1 - sy];
    case 270:
      return [1 - sy, sx];
    default:
      return [sx, sy];
  }
}

describe.each([0, 90, 180, 270])(
  "widget appearances on /Rotate %i",
  (rotate) => {
    it("renders the signature image in unrotated orientation", async () => {
      const [sig] = await renderSignatureFieldAppearances(
        await buildPdf("Sig", rotate),
      );
      expect(sig).toMatchObject({
        x: RECT.x,
        y: 800 - RECT.y - H,
        width: W,
        height: H,
        sourcePageWidth: 600,
        sourcePageHeight: 800,
      });
      expectUnrotatedQuadrants(sig.imageData);
    });

    it("renders the signature image with a non-zero CropBox origin", async () => {
      const crop = { x: 40, y: 30 };
      const [sig] = await renderSignatureFieldAppearances(
        await buildPdf("Sig", rotate, crop),
      );
      expect(sig).toMatchObject({ x: RECT.x, y: 800 - crop.y - RECT.y - H });
      expectUnrotatedQuadrants(sig.imageData);
    });

    it("shows a backend-style rotated stamp upright on screen", async () => {
      const [sig] = await renderSignatureFieldAppearances(
        await buildPdf("Sig", rotate, { x: 40, y: 30 }, true),
      );
      expect(sig.imageData).not.toBeNull();
      if (!sig.imageData) return;
      expect([sig.imageData.width, sig.imageData.height]).toEqual([W, H]);
      expect(
        pixelAt(sig.imageData, ...unrotatedFraction(rotate, 0.25, 0.25)),
      ).toEqual([255, 0, 0, 255]);
      expect(
        pixelAt(sig.imageData, ...unrotatedFraction(rotate, 0.75, 0.75)),
      ).toEqual([0, 0, 255, 255]);
    });

    it("renders push-button appearances in unrotated orientation", async () => {
      const [btn] = await renderButtonFieldAppearances(
        await buildPdf("Btn", rotate, { x: 40, y: 30 }),
      );
      expect(btn).toMatchObject({ x: RECT.x, width: W, height: H });
      expectUnrotatedQuadrants(btn.imageData);
    });
  },
);

describe("withUnrotatedPage", () => {
  const fakeModule = (rotation: number) => {
    const state = { rotation, seen: -1 };
    const m = {
      FPDFPage_GetRotation: () => state.rotation,
      FPDFPage_SetRotation: (_page: number, r: number) => {
        state.rotation = r;
      },
    } as unknown as Parameters<typeof withUnrotatedPage>[0];
    return { m, state };
  };

  it("clears /Rotate during the render and restores it after", () => {
    const { m, state } = fakeModule(3);
    const result = withUnrotatedPage(m, 1, () => {
      state.seen = state.rotation;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(state.seen).toBe(0);
    expect(state.rotation).toBe(3);
  });

  it("restores /Rotate when the render throws", () => {
    const { m, state } = fakeModule(1);
    expect(() =>
      withUnrotatedPage(m, 1, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(state.rotation).toBe(1);
  });
});
