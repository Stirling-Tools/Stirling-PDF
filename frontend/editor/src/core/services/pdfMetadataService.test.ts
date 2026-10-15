import { describe, expect, test, vi } from "vitest";
import {
  extractCustomMetadata,
  extractPDFMetadata,
} from "@app/services/pdfMetadataService";
import { TrappedStatus } from "@app/types/metadata";

const { createDocumentMock, destroyDocumentMock } = vi.hoisted(() => ({
  createDocumentMock: vi.fn(),
  destroyDocumentMock: vi.fn(),
}));

vi.mock("@app/services/fileAnalyzer", () => ({
  FileAnalyzer: {
    isValidPDF: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: createDocumentMock,
    destroyDocument: destroyDocumentMock,
  },
}));

describe("extractCustomMetadata", () => {
  test("extracts custom metadata from the PDF.js Custom object", () => {
    const customMetadata = extractCustomMetadata({
      Custom: {
        Department: "Engineering",
        Project: "Stirling",
      },
    });

    expect(customMetadata).toStrictEqual([
      { key: "Department", value: "Engineering", id: "custom1" },
      { key: "Project", value: "Stirling", id: "custom2" },
    ]);
  });

  test("extracts non-standard top-level info fields as custom metadata", () => {
    const customMetadata = extractCustomMetadata({
      Title: "Document title",
      Author: "Document author",
      Creator: "Microsoft Word 2019",
      Company: "Example Ltd",
      Manager: "Jane Doe",
    });

    expect(customMetadata).toStrictEqual([
      { key: "Company", value: "Example Ltd", id: "custom1" },
      { key: "Manager", value: "Jane Doe", id: "custom2" },
    ]);
  });

  test("keeps Custom entries when the same key also appears at the top level", () => {
    const customMetadata = extractCustomMetadata({
      Custom: {
        Company: "Custom Company",
      },
      Company: "Top-level Company",
    });

    expect(customMetadata).toStrictEqual([
      { key: "Company", value: "Custom Company", id: "custom1" },
    ]);
  });

  test("skips empty custom metadata values", () => {
    const customMetadata = extractCustomMetadata({
      Custom: {
        Empty: "",
        Missing: null,
        Present: "value",
      },
      AnotherEmpty: "",
    });

    expect(customMetadata).toStrictEqual([
      { key: "Present", value: "value", id: "custom1" },
    ]);
  });

  test("extracts non-standard XMP metadata entries", () => {
    const xmpMetadata = new Map<string, unknown>([
      ["dc:title", "Document title"],
      ["pdf:Producer", "PDF Producer"],
      ["pdfx:Company", "Example Ltd"],
      ["pdfx:Manager", "Jane Doe"],
    ]);

    const customMetadata = extractCustomMetadata({}, xmpMetadata);

    expect(customMetadata).toStrictEqual([
      { key: "pdfx:Company", value: "Example Ltd", id: "custom1" },
      { key: "pdfx:Manager", value: "Jane Doe", id: "custom2" },
    ]);
  });
});

describe("extractPDFMetadata", () => {
  test("falls back to XMP metadata for standard fields and custom entries", async () => {
    const pdfDocument = {
      getMetadata: vi.fn().mockResolvedValue({
        info: {},
        metadata: new Map<string, unknown>([
          ["dc:title", "XMP title"],
          ["dc:creator", "XMP author"],
          ["dc:description", "XMP subject"],
          ["pdf:Keywords", "xmp, keywords"],
          ["xmp:CreatorTool", "Microsoft Word 2019"],
          ["pdf:Producer", "PDF Producer"],
          ["xmp:CreateDate", "2024-01-02T03:04:05"],
          ["xmp:ModifyDate", "2024-01-03T04:05:06"],
          ["pdfx:Company", "Example Ltd"],
        ]),
      }),
    };
    createDocumentMock.mockResolvedValue(pdfDocument);

    const result = await extractPDFMetadata(
      new File(["%PDF-1.7"], "metadata.pdf", { type: "application/pdf" }),
    );

    expect(result).toStrictEqual({
      success: true,
      metadata: {
        title: "XMP title",
        author: "XMP author",
        subject: "XMP subject",
        keywords: "xmp, keywords",
        creator: "Microsoft Word 2019",
        producer: "PDF Producer",
        creationDate: "2024/01/02 03:04:05",
        modificationDate: "2024/01/03 04:05:06",
        trapped: TrappedStatus.UNKNOWN,
        customMetadata: [
          { key: "pdfx:Company", value: "Example Ltd", id: "custom1" },
        ],
      },
    });
    expect(destroyDocumentMock).toHaveBeenCalledWith(pdfDocument);
  });
});
