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
} from "@app/utils/signatureFlattening";
import type { SignatureAPI } from "@app/components/viewer/viewerTypes";

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
});
