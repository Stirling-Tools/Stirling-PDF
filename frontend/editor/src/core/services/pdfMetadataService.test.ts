import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { extractPDFMetadata } from "@app/services/pdfMetadataService";
import { TrappedStatus } from "@app/types/metadata";
import { PDFDocument, PDFName, PDFString } from "@cantoo/pdf-lib";

describe("pdfMetadataService", () => {
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
  it("rejects non-PDF files", async () => {
    const file = new File(["not a pdf content"], "test.txt", {
      type: "text/plain",
    });
    const result = await extractPDFMetadata(file);
    expect(result.success).toBe(false);
  });

  it("extracts standard info metadata and custom fields", async () => {
    const doc = await PDFDocument.create();
    doc.setTitle("Sample Document");
    doc.setAuthor("Test Author");
    doc.setSubject("Test Subject");
    doc.setKeywords(["testing", "pdf"]);
    doc.setProducer("Custom Producer");
    doc.setCreator("Custom Creator");
    const d = new Date("2024-06-15T12:00:00Z");
    doc.setCreationDate(d);
    doc.setModificationDate(d);

    const infoDict = (
      doc as unknown as { getInfoDict(): import("@cantoo/pdf-lib").PDFDict }
    ).getInfoDict();
    infoDict.set(
      PDFName.of("StirlingPDFClassification"),
      PDFString.of(JSON.stringify({ labels: ["Invoice", "Finance"] })),
    );
    infoDict.set(PDFName.of("Trapped"), PDFName.of("True"));

    const bytes = await doc.save();
    const file = new File([bytes as unknown as BlobPart], "sample.pdf", {
      type: "application/pdf",
    });

    const result = await extractPDFMetadata(file);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.metadata.title).toBe("Sample Document");
    expect(result.metadata.author).toBe("Test Author");
    expect(result.metadata.subject).toBe("Test Subject");
    expect(result.metadata.keywords).toBe("testing pdf");
    expect(result.metadata.producer).toBe("Custom Producer");
    expect(result.metadata.creator).toBe("Custom Creator");
    expect(result.metadata.trapped).toBe(TrappedStatus.TRUE);

    const classification = result.metadata.customMetadata.find(
      (entry) => entry.key === "StirlingPDFClassification",
    );
    expect(classification).toBeDefined();
    expect(classification?.value).toBe(
      JSON.stringify({ labels: ["Invoice", "Finance"] }),
    );
  });
});
