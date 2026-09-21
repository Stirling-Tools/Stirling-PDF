import { describe, expect, it, vi, beforeEach } from "vitest";
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";
import { documentHasLayers } from "@app/components/viewer/layerUtils";
import * as documentBytesCache from "@app/services/documentBytesCache";
import {
  registerEngineDocumentProbe,
  resolveEngineDocumentOpen,
} from "@app/services/documentProbeEngine";

const buildPdfWithLayers = async (hasLayers: boolean): Promise<File> => {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  if (hasLayers) {
    const context = doc.context;
    const ocg = context.register(
      context.obj({ Type: "OCG", Name: PDFString.of("Layer 1") }),
    );
    doc.catalog.set(
      PDFName.of("OCProperties"),
      context.obj({ OCGs: [ocg], D: { ON: [ocg] } }),
    );
  }
  const bytes = await doc.save();
  const file = new File(
    [bytes as BlobPart],
    hasLayers ? "layered.pdf" : "plain.pdf",
    {
      type: "application/pdf",
    },
  );
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    writable: true,
    value: async () => bytes.buffer.slice(0) as ArrayBuffer,
  });
  return file;
};

describe("documentHasLayers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects when a PDF contains OCProperties", async () => {
    const file = await buildPdfWithLayers(true);
    expect(await documentHasLayers(file)).toBe(true);
  });

  it("returns false for a PDF without OCProperties", async () => {
    const file = await buildPdfWithLayers(false);
    expect(await documentHasLayers(file)).toBe(false);
  });

  it("memoizes result so getDocumentBytes is not called repeatedly", async () => {
    const file = await buildPdfWithLayers(true);
    const spy = vi.spyOn(documentBytesCache, "getDocumentBytes");

    const first = await documentHasLayers(file);
    const second = await documentHasLayers(file);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("uses pre-seeded bytes without calling getDocumentBytes", async () => {
    const file = await buildPdfWithLayers(true);
    const bytes = await file.arrayBuffer();
    const spy = vi.spyOn(documentBytesCache, "getDocumentBytes");

    const result = await documentHasLayers(file, bytes);

    expect(result).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("takes an exact worker verdict without reading the document", async () => {
    const file = await buildPdfWithLayers(true);
    registerEngineDocumentProbe(
      file,
      async () => ({ formType: 0, attachmentCount: 0 }),
      async () => false,
    );
    resolveEngineDocumentOpen(file, "doc-layers");
    const spy = vi.spyOn(documentBytesCache, "getDocumentBytes");

    expect(await documentHasLayers(file)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses the document when the worker cannot decide", async () => {
    const file = await buildPdfWithLayers(true);
    registerEngineDocumentProbe(
      file,
      async () => ({ formType: 0, attachmentCount: 0 }),
      async () => null,
    );
    resolveEngineDocumentOpen(file, "doc-unknown");

    expect(await documentHasLayers(file)).toBe(true);
  });
});
