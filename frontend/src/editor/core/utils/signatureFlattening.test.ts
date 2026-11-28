import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  PDFRawStream,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import {
  embedSignatureImages,
  flattenSignatures,
} from "@editor/utils/signatureFlattening";
import type { SignatureAPI } from "@editor/components/viewer/viewerTypes";
import {
  closeDocAndFreeBuffer,
  getPdfiumModule,
  openRawDocumentSafe,
} from "@editor/services/pdfiumService";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

beforeAll(async () => {
  // Resolve through the module system, not process.cwd: the package is hoisted
  // to frontend/node_modules while vitest workers may run with cwd at editor/.
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

const readPageContentStreams = (document: PDFDocument): string[] => {
  const contents = document.getPage(0).node.Contents();
  if (!(contents instanceof PDFArray)) return [];

  const decoder = new TextDecoder();
  const streams: string[] = [];
  for (let index = 0; index < contents.size(); index++) {
    const stream = contents.lookup(index, PDFRawStream);
    streams.push(decoder.decode(decodePDFRawStream(stream).decode()));
  }
  return streams;
};

describe("signatureFlattening", () => {
  test("leaves live signatures intact when exporting fails", async () => {
    const deleteAnnotation = vi.fn();
    const api: SignatureAPI = {
      addImageSignature: vi.fn(),
      activateDrawMode: vi.fn(),
      activateSignaturePlacementMode: vi.fn(),
      activateDeleteMode: vi.fn(),
      deleteAnnotation,
      updateDrawSettings: vi.fn(),
      deactivateTools: vi.fn(),
      selectAnnotation: vi.fn(),
      getPageAnnotations: async () => [
        {
          id: "live",
          rect: { x: 25, y: 30, width: 120, height: 50 },
          imageSrc: `data:image/png;base64,${ONE_PIXEL_PNG}`,
        },
      ],
    };
    const result = await flattenSignatures({
      signatureApiRef: { current: api },
      getImageData: () => `data:image/png;base64,${ONE_PIXEL_PNG}`,
      exportActions: { saveAsCopy: async () => null },
      selectors: {
        getAllFileIds: () => [],
        getStirlingFileStub: () => undefined,
        getFile: () => undefined,
      },
      getScrollState: () => ({ currentPage: 1, totalPages: 1 }),
    });
    expect(result).toBeNull();
    expect(deleteAnnotation).not.toHaveBeenCalled();
  });

  test("adds a PDFium stamp without regenerating page content", async () => {
    const sourceDocument = await PDFDocument.create();
    const sourcePage = sourceDocument.addPage([300, 400]);
    const markerStream = sourceDocument.context.stream(
      "q\n% ORIGINAL_TYPE3_CONTENT\nQ\n",
    );
    sourcePage.node.addContentStream(
      sourceDocument.context.register(markerStream),
    );
    const sourceBytes = await sourceDocument.save();

    const outputBytes = await embedSignatureImages(
      Uint8Array.from(sourceBytes).buffer,
      [
        {
          pageIndex: 0,
          annotations: [
            {
              id: "signature-1",
              // EmbedPDF may expose an internal asset reference here after the
              // annotation has been placed. The persisted PNG must win.
              imageData: "embedpdf-asset-reference",
              rect: {
                origin: { x: 25, y: 30 },
                size: { width: 120, height: 50 },
              },
              imageSrc: `data:image/png;base64,${ONE_PIXEL_PNG}`,
            },
          ],
        },
      ],
      (id) =>
        id === "signature-1"
          ? `data:image/png;base64,${ONE_PIXEL_PNG}`
          : undefined,
      async () => ({
        width: 1,
        height: 1,
        rgba: new Uint8Array([0, 80, 180, 255]),
      }),
    );

    const outputDocument = await PDFDocument.load(outputBytes);
    const contentStreams = readPageContentStreams(outputDocument);
    const annotations = outputDocument.getPage(0).node.Annots();

    expect(contentStreams).toContain("q\n% ORIGINAL_TYPE3_CONTENT\nQ\n");
    expect(annotations).toBeInstanceOf(PDFArray);

    const stamp = annotations?.lookup(0, PDFDict);
    const stampRect = stamp?.lookup(PDFName.of("Rect"), PDFArray);
    expect(stamp?.get(PDFName.of("Subtype"))).toEqual(PDFName.of("Stamp"));
    expect(stamp?.lookup(PDFName.of("F"), PDFNumber).asNumber()).toBe(196);
    expect(stamp?.get(PDFName.of("AP"))).toBeDefined();
    expect(
      Array.from({ length: stampRect?.size() ?? 0 }, (_, index) =>
        stampRect?.lookup(index, PDFNumber).asNumber(),
      ),
    ).toEqual([25, 320, 145, 370]);
  }, 20_000);

  test("locks the exported signature without duplicating it or changing its appearance", async () => {
    const sourceDocument = await PDFDocument.create();
    const page = sourceDocument.addPage([300, 400]);
    const stamp = sourceDocument.context.obj({
      Type: "Annot",
      Subtype: "Stamp",
      NM: PDFString.of("signature-existing"),
      Rect: [25, 320, 145, 370],
      F: 4,
    });
    const other = sourceDocument.context.obj({
      Type: "Annot",
      Subtype: "Text",
      Rect: [10, 10, 20, 20],
      F: 4,
    });
    page.node.set(
      PDFName.of("Annots"),
      sourceDocument.context.obj([
        sourceDocument.context.register(stamp),
        sourceDocument.context.register(other),
      ]),
    );
    const bytes = await sourceDocument.save();
    const decoder = vi.fn();
    const output = await embedSignatureImages(
      Uint8Array.from(bytes).buffer,
      [
        {
          pageIndex: 0,
          annotations: [
            {
              id: "signature-existing",
              rect: { x: 25, y: 30, width: 120, height: 50 },
            },
          ],
        },
      ],
      () => undefined,
      decoder,
    );
    const document = await PDFDocument.load(output);
    const annotations = document.getPage(0).node.Annots();
    expect(annotations?.size()).toBe(2);
    expect(
      annotations
        ?.lookup(0, PDFDict)
        .lookup(PDFName.of("F"), PDFNumber)
        .asNumber(),
    ).toBe(196);
    expect(
      annotations
        ?.lookup(1, PDFDict)
        .lookup(PDFName.of("F"), PDFNumber)
        .asNumber(),
    ).toBe(4);
    expect(decoder).not.toHaveBeenCalled();
  });

  test("rejects failed signature decoding instead of returning a partly signed PDF", async () => {
    const document = await PDFDocument.create();
    document.addPage([300, 400]);
    const bytes = await document.save();
    await expect(
      embedSignatureImages(
        Uint8Array.from(bytes).buffer,
        [
          {
            pageIndex: 0,
            annotations: [
              {
                id: "missing",
                rect: { x: 25, y: 30, width: 120, height: 50 },
                imageSrc: `data:image/png;base64,${ONE_PIXEL_PNG}`,
              },
            ],
          },
        ],
        () => undefined,
        async () => null,
      ),
    ).rejects.toThrow("Could not decode signature image");
  });

  // EmbedPDF inserts Sign stamps upright, counter-rotated against the page's /Rotate.
  test.each([
    [90, 270],
    [180, 180],
    [270, 90],
  ])(
    "keeps a stamp upright on a /Rotate %i page (annotation rotation %i)",
    async (pageRotate, annotationRotation) => {
      const source = await PDFDocument.create();
      source
        .addPage([300, 400])
        .node.set(PDFName.of("Rotate"), PDFNumber.of(pageRotate));
      const quarterTurn = pageRotate % 180 !== 0;
      const size = quarterTurn
        ? { width: 50, height: 120 }
        : { width: 120, height: 50 };
      const output = await embedSignatureImages(
        Uint8Array.from(await source.save()).buffer,
        [
          {
            pageIndex: 0,
            annotations: [
              {
                id: "upright",
                rotation: annotationRotation,
                rect: { origin: { x: 25, y: 30 }, size },
                imageSrc: `data:image/png;base64,${ONE_PIXEL_PNG}`,
              },
            ],
          },
        ],
        () => `data:image/png;base64,${ONE_PIXEL_PNG}`,
        // Red on the left, blue on the right.
        async () => ({
          width: 2,
          height: 1,
          rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]),
        }),
      );

      // Render the page as a reader shows it, with /Rotate applied.
      const m = await getPdfiumModule();
      const docPtr = await openRawDocumentSafe(output);
      try {
        const pagePtr = m.FPDF_LoadPage(docPtr, 0);
        const w = Math.round(m.FPDF_GetPageWidthF(pagePtr));
        const h = Math.round(m.FPDF_GetPageHeightF(pagePtr));
        const bitmap = m.FPDFBitmap_Create(w, h, 1);
        m.FPDFBitmap_FillRect(bitmap, 0, 0, w, h, 0xffffffff);
        m.FPDF_RenderPageBitmap(bitmap, pagePtr, 0, 0, w, h, 0, 0x01 | 0x10);
        const heap = (m.pdfium as unknown as { HEAPU8: Uint8Array }).HEAPU8;
        const buffer = m.FPDFBitmap_GetBuffer(bitmap);
        const stride = m.FPDFBitmap_GetStride(bitmap);
        const box = { red: [] as number[][], blue: [] as number[][] };
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = buffer + y * stride + x * 4;
            const [r, g, b] = [heap[i], heap[i + 1], heap[i + 2]];
            if (r > 200 && g < 60 && b < 60) box.red.push([x, y]);
            if (b > 200 && r < 60 && g < 60) box.blue.push([x, y]);
          }
        }
        m.FPDFBitmap_Destroy(bitmap);
        m.FPDF_ClosePage(pagePtr);
        const centre = (points: number[][]) =>
          points
            .reduce((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0])
            .map((value) => value / points.length);
        const xs = [...box.red, ...box.blue].map(([x]) => x);
        const ys = [...box.red, ...box.blue].map(([, y]) => y);
        // Shown landscape, with red to the left of blue at the same height.
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(
          2 * (Math.max(...ys) - Math.min(...ys)),
        );
        const [red, blue] = [centre(box.red), centre(box.blue)];
        expect(red[0]).toBeLessThan(blue[0]);
        expect(Math.abs(red[1] - blue[1])).toBeLessThan(2);
      } finally {
        closeDocAndFreeBuffer(m, docPtr);
      }
    },
    20_000,
  );
});
