// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentForEditing,
} from "@app/services/pdfiumService";
import {
  EncryptedPdfError,
  drawMeasurementsIntoPdf,
} from "@app/tools/measure/measurementDrawing";
import type { Measurement } from "@app/utils/measurementTypes";

// FPDF_PAGEOBJ_* in fpdf_edit.h.
const TEXT_OBJECT = 1;
const PATH_OBJECT = 2;

async function blankPdf(
  prepare?: (doc: PDFDocument) => void,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  doc.addPage([600, 800]);
  prepare?.(doc);
  const bytes = await doc.save();
  return bytes.slice().buffer;
}

function item(measurement: Measurement, text: string) {
  return {
    measurement,
    text,
    color: "#1e88e5", // theme-allow-color measurement colour data
    strokeWidth: 2,
  };
}

const LINE: Measurement = {
  id: "d1",
  kind: "distance",
  points: [
    { pageIndex: 0, x: 100, y: 100 },
    { pageIndex: 0, x: 300, y: 100 },
  ],
};

const AREA: Measurement = {
  id: "a1",
  kind: "area",
  points: [
    { pageIndex: 0, x: 100, y: 200 },
    { pageIndex: 0, x: 200, y: 200 },
    { pageIndex: 0, x: 200, y: 300 },
  ],
};

interface DrawnObject {
  type: number;
  bounds: { left: number; bottom: number; right: number; top: number };
  text: string | null;
}

/** What pdfium finds on the first page of `bytes`. */
async function readFirstPage(
  bytes: Uint8Array,
): Promise<{ annotations: number; objects: DrawnObject[] }> {
  const m: WrappedPdfiumModule = await getPdfiumModule();
  const docPtr = await openRawDocumentForEditing(bytes);
  const pagePtr = m.FPDF_LoadPage(docPtr, 0);
  const textPage = m.FPDFText_LoadPage(pagePtr);
  const buf = m.pdfium.wasmExports.malloc(16);
  try {
    const objects: DrawnObject[] = [];
    for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
      const obj = m.FPDFPage_GetObject(pagePtr, i);
      const type = m.FPDFPageObj_GetType(obj);
      m.FPDFPageObj_GetBounds(obj, buf, buf + 4, buf + 8, buf + 12);
      let text: string | null = null;
      if (type === TEXT_OBJECT) {
        const size = m.FPDFTextObj_GetText(obj, textPage, 0, 0);
        const out = m.pdfium.wasmExports.malloc(size);
        m.FPDFTextObj_GetText(obj, textPage, out, size);
        text = m.pdfium.UTF16ToString(out);
        m.pdfium.wasmExports.free(out);
      }
      objects.push({
        type,
        bounds: {
          left: m.pdfium.getValue(buf, "float"),
          bottom: m.pdfium.getValue(buf + 4, "float"),
          right: m.pdfium.getValue(buf + 8, "float"),
          top: m.pdfium.getValue(buf + 12, "float"),
        },
        text,
      });
    }
    return { annotations: m.FPDFPage_GetAnnotCount(pagePtr), objects };
  } finally {
    m.pdfium.wasmExports.free(buf);
    m.FPDFText_ClosePage(textPage);
    m.FPDF_ClosePage(pagePtr);
    closeDocAndFreeBuffer(m, docPtr);
  }
}

describe("drawMeasurementsIntoPdf", () => {
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
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test("draws paths and labels into the page rather than adding annotations", async () => {
    const bytes = await drawMeasurementsIntoPdf(await blankPdf(), [
      item(LINE, "7.056 m"),
      item(AREA, "Kitchen: 6.22 m²"),
    ]);
    const { annotations, objects } = await readFirstPage(bytes);

    expect(annotations).toBe(0);
    // Each measurement is its shape, its label box and its label text.
    expect(objects.map((o) => o.type)).toEqual([
      PATH_OBJECT,
      PATH_OBJECT,
      TEXT_OBJECT,
      PATH_OBJECT,
      PATH_OBJECT,
      TEXT_OBJECT,
    ]);
    expect(objects.filter((o) => o.text).map((o) => o.text)).toEqual([
      "7.056 m",
      "Kitchen: 6.22 m²",
    ]);
  });

  test("places points from the top of the crop box, in PDF user space", async () => {
    const source = await blankPdf((doc) =>
      doc.getPage(0).setCropBox(50, 40, 500, 700),
    );
    const bytes = await drawMeasurementsIntoPdf(source, [item(LINE, "7 m")]);
    const [line] = (await readFirstPage(bytes)).objects;

    // y 100 below the crop box's top (40 + 700) is 640; x is offset by 50.
    // Bounds include the 2pt stroke, so check the centre and the length.
    const { left, right, top, bottom } = line.bounds;
    expect((left + right) / 2).toBeCloseTo(250, 0);
    expect((top + bottom) / 2).toBeCloseTo(640, 0);
    expect(right - left).toBeGreaterThanOrEqual(200);
    expect(right - left).toBeLessThanOrEqual(204);
  });

  test("keeps labels as text, whatever characters they contain", async () => {
    const label =
      "Room (A) \\ x) /A << /S /JavaScript /JS (app.alert(1)) >> /Z (y";
    const bytes = await drawMeasurementsIntoPdf(await blankPdf(), [
      item(LINE, `${label}: 7.056 m`),
    ]);
    const { annotations, objects } = await readFirstPage(bytes);

    expect(annotations).toBe(0);
    expect(objects.find((o) => o.text)?.text).toBe(`${label}: 7.056 m`);
  });

  test("refuses an encrypted PDF", async () => {
    const encrypted = await blankPdf((doc) =>
      doc.encrypt({ userPassword: "", ownerPassword: "owner" }),
    );
    await expect(
      drawMeasurementsIntoPdf(encrypted, [item(LINE, "7.056 m")]),
    ).rejects.toBeInstanceOf(EncryptedPdfError);
  });
});
