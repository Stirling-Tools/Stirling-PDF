import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  closeRawDocument,
  getPdfiumModule,
  openRawDocumentSafe,
  resetPdfiumModule,
} from "@app/services/pdfiumService";
import { PdfiumPageRenderer } from "@app/tools/pdfTextEditor/pdfium/PdfiumPageRenderer";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";

// Renders coloured quadrants through the real wasm engine: the unit fakes
// paint four bytes per pixel whatever format they are handed, so only this
// catches a bitmap created in a format the copy-out does not match.
const PAGE_POINTS = 200;
const QUADRANT = PAGE_POINTS / 2;

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

/** One page, four quadrants: red and green above blue and white. */
function colouredPdf(): Uint8Array {
  const content = [
    `1 0 0 rg 0 ${QUADRANT} ${QUADRANT} ${QUADRANT} re f`,
    `0 1 0 rg ${QUADRANT} ${QUADRANT} ${QUADRANT} ${QUADRANT} re f`,
    `0 0 1 rg 0 0 ${QUADRANT} ${QUADRANT} re f`,
    `1 1 1 rg ${QUADRANT} 0 ${QUADRANT} ${QUADRANT} re f`,
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_POINTS} ${PAGE_POINTS}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, body] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function pixelAt(
  data: Uint8ClampedArray,
  stride: number,
  x: number,
  y: number,
): number[] {
  const start = y * stride + x * 4;
  return Array.from(data.slice(start, start + 4));
}

function countMatching(
  data: Uint8ClampedArray,
  test: (red: number, green: number, blue: number, alpha: number) => boolean,
): number {
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (test(data[i], data[i + 1], data[i + 2], data[i + 3])) count++;
  }
  return count;
}

let module: WrappedPdfiumModule;

beforeAll(async () => {
  const wasmPath = createRequire(import.meta.url).resolve(
    "@embedpdf/pdfium/pdfium.wasm",
  );
  const wasmBytes = await readFile(wasmPath);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
      ),
    ),
  );
  module = await getPdfiumModule();
  vi.stubGlobal("ImageData", FakeImageData);
});

afterAll(() => {
  resetPdfiumModule();
});

describe("PdfiumPageRenderer colour output", () => {
  it("copies BGRA bitmaps into RGBA pixels", async () => {
    const docPtr = await openRawDocumentSafe(colouredPdf());
    try {
      const pagePtr = module.FPDF_LoadPage(docPtr, 0);
      const editor = {
        module,
        formEnvironment: () => 0,
        notifyFormPageLoaded: () => undefined,
      } as unknown as EditorDocument;
      const page = {
        pagePtr,
        width: module.FPDF_GetPageWidth(pagePtr),
        height: module.FPDF_GetPageHeight(pagePtr),
      } as unknown as Page;

      const image = await PdfiumPageRenderer.render(editor, page, 1);
      const stride = image.width * 4;

      // Channel order, per pixel: a Gray bitmap (format 1) would put the same
      // value in all four slots, and the alpha of the RGBA image would be the
      // grey level rather than opaque.
      expect(pixelAt(image.data, stride, 50, 50)).toEqual([255, 0, 0, 255]);
      expect(pixelAt(image.data, stride, 150, 50)).toEqual([0, 255, 0, 255]);
      expect(pixelAt(image.data, stride, 50, 150)).toEqual([0, 0, 255, 255]);
      expect(pixelAt(image.data, stride, 150, 150)).toEqual([
        255, 255, 255, 255,
      ]);

      // Whole quadrants, so a format that only writes one byte per pixel into
      // a four-byte stride cannot pass on a handful of correct pixels.
      const eachChannel =
        (red: number, green: number, blue: number) =>
        (r: number, g: number, b: number, a: number) =>
          a === 255 && r === red && g === green && b === blue;
      const quadrantPixels = QUADRANT * QUADRANT;
      expect(countMatching(image.data, eachChannel(255, 0, 0))).toBeGreaterThan(
        quadrantPixels / 2,
      );
      expect(countMatching(image.data, eachChannel(0, 255, 0))).toBeGreaterThan(
        quadrantPixels / 2,
      );
      expect(countMatching(image.data, eachChannel(0, 0, 255))).toBeGreaterThan(
        quadrantPixels / 2,
      );
      expect(
        countMatching(image.data, eachChannel(255, 255, 255)),
      ).toBeGreaterThan(quadrantPixels / 2);
    } finally {
      await closeRawDocument(docPtr);
    }
  });
});
