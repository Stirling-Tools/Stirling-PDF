import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import { adjustColorsInBrowser } from "@app/hooks/tools/adjustColorsRust/useAdjustColorsRustOperation";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentSafe,
} from "@app/services/pdfiumService";
import type { ColorAdjustments } from "@app/services/toolsCore";

// Runs the real Rust wasm against the real PDFium build, so only where
// `task tools-core:build:wasm` has produced it.
const TOOLS_WASM = path.join(
  import.meta.dirname,
  "../../../../../public/wasm/stirling-tools.wasm",
);
const FIXTURE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/compare_sample_a.pdf",
);

const NEUTRAL: ColorAdjustments = {
  contrast: 100,
  brightness: 100,
  saturation: 100,
  red: 100,
  green: 100,
  blue: 100,
};

interface PageFacts {
  pages: number;
  width: number;
  height: number;
  corner: number[];
}

// jsdom has no Blob.arrayBuffer and setupTests stubs it with placeholder bytes,
// so files are read with FileReader and the input carries its real bytes.
function readBytes(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function pdfFile(bytes: Uint8Array<ArrayBuffer>, name: string): File {
  const file = new File([bytes], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => bytes.slice().buffer,
  });
  return file;
}

async function inspect(file: File): Promise<PageFacts> {
  const m = await getPdfiumModule();
  const doc = await openRawDocumentSafe(await readBytes(file));
  try {
    const page = m.FPDF_LoadPage(doc, 0);
    const facts = {
      pages: m.FPDF_GetPageCount(doc),
      width: m.FPDF_GetPageWidthF(page),
      height: m.FPDF_GetPageHeightF(page),
      corner: cornerPixel(m, page),
    };
    m.FPDF_ClosePage(page);
    return facts;
  } finally {
    closeDocAndFreeBuffer(m, doc);
  }
}

/** RGB of the top-left pixel of a 10x10 render. */
function cornerPixel(m: WrappedPdfiumModule, page: number): number[] {
  const bitmap = m.FPDFBitmap_Create(10, 10, 0);
  try {
    m.FPDFBitmap_FillRect(bitmap, 0, 0, 10, 10, 0xff00ff00);
    m.FPDF_RenderPageBitmap(bitmap, page, 0, 0, 10, 10, 0, 0);
    const memory = (
      m.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory }
    ).memory;
    const [blue, green, red] = new Uint8Array(
      memory.buffer,
      m.FPDFBitmap_GetBuffer(bitmap),
      3,
    );
    return [red, green, blue];
  } finally {
    m.FPDFBitmap_Destroy(bitmap);
  }
}

describe.skipIf(!existsSync(TOOLS_WASM))("adjustColorsInBrowser", () => {
  let fixture: File;

  beforeAll(async () => {
    const pdfiumWasm = await readFile(
      createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
    );
    const toolsWasm = await readFile(TOOLS_WASM);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        Promise.resolve(
          new Response(
            String(url).endsWith("stirling-tools.wasm")
              ? toolsWasm
              : pdfiumWasm,
            { headers: { "Content-Type": "application/wasm" } },
          ),
        ),
      ),
    );
    fixture = pdfFile(new Uint8Array(await readFile(FIXTURE)), "sample.pdf");
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test("keeps every page and its rotated size", async () => {
    const source = await inspect(fixture);

    const adjusted = await inspect(
      await adjustColorsInBrowser(fixture, NEUTRAL),
    );

    expect(adjusted.pages).toBe(source.pages);
    expect(adjusted.width).toBeCloseTo(source.width, 2);
    expect(adjusted.height).toBeCloseTo(source.height, 2);
  });

  test("replaces the page with an opaque image of it", async () => {
    const adjusted = await inspect(
      await adjustColorsInBrowser(fixture, NEUTRAL),
    );

    expect(adjusted.corner).toEqual([255, 255, 255]);
  });

  test("applies the adjustments to the pixels", async () => {
    const dark = await inspect(
      await adjustColorsInBrowser(fixture, { ...NEUTRAL, brightness: 0 }),
    );

    expect(dark.corner).toEqual([0, 0, 0]);
  });

  test("keeps the input's file name", async () => {
    const adjusted = await adjustColorsInBrowser(fixture, NEUTRAL);

    expect(adjusted.name).toBe("sample.pdf");
    expect(adjusted.type).toBe("application/pdf");
  });
});
