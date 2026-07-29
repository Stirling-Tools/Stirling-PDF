import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from "@cantoo/pdf-lib";
import { embedSignatureImages } from "@app/utils/signatureFlattening";

const ONE_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

beforeAll(async () => {
  const wasmPath = path.resolve(
    process.cwd(),
    "node_modules/@embedpdf/pdfium/dist/pdfium.wasm",
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
});
