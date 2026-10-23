import { describe, it, expect } from "vitest";
import {
  isPdfFile,
  detectFileExtension,
  formatFileSize,
  detectNonPdfFileType,
  getFileFormats,
  mimeTypeToExtension,
  detectExtensionFromSignature,
} from "@editor/utils/fileUtils";

describe("fileUtils", () => {
  describe("mimeTypeToExtension", () => {
    it("maps common MIME types to extensions", () => {
      expect(mimeTypeToExtension("application/pdf")).toBe("pdf");
      expect(mimeTypeToExtension("image/jpeg")).toBe("jpg");
      expect(mimeTypeToExtension("image/png")).toBe("png");
      expect(mimeTypeToExtension("application/zip")).toBe("zip");
    });

    it("ignores parameters and casing", () => {
      expect(mimeTypeToExtension("Application/PDF; charset=binary")).toBe(
        "pdf",
      );
    });

    it("returns empty string for unknown or empty input", () => {
      expect(mimeTypeToExtension("application/x-unknown")).toBe("");
      expect(mimeTypeToExtension("")).toBe("");
    });
  });

  describe("detectExtensionFromSignature", () => {
    it("detects PDF from its %PDF signature", async () => {
      const blob = new Blob([
        new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
      ]);
      await expect(detectExtensionFromSignature(blob)).resolves.toBe("pdf");
    });

    it("detects ZIP, JPEG and PNG signatures", async () => {
      await expect(
        detectExtensionFromSignature(
          new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])]),
        ),
      ).resolves.toBe("zip");
      await expect(
        detectExtensionFromSignature(
          new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])]),
        ),
      ).resolves.toBe("jpg");
      await expect(
        detectExtensionFromSignature(
          new Blob([
            new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          ]),
        ),
      ).resolves.toBe("png");
    });

    it("returns empty string for unknown or empty content", async () => {
      await expect(
        detectExtensionFromSignature(new Blob([new Uint8Array([1, 2, 3, 4])])),
      ).resolves.toBe("");
      await expect(
        detectExtensionFromSignature(new Blob([])),
      ).resolves.toBe("");
    });
  });

  it("classifies using existing PDF detection, stored protection and overlapping backend categories", () => {
    expect(
      getFileFormats({ name: "download", type: "application/pdf" }),
    ).toEqual(["PDF"]);
    expect(getFileFormats({ name: "document.PDF", type: "" })).toEqual(["PDF"]);
    expect(getFileFormats({ name: "document.docx", type: "" })).toEqual([
      "WORD",
      "EBOOK",
    ]);
    expect(getFileFormats({ name: "unknown", type: "" })).toEqual([]);
    expect(
      getFileFormats({
        name: "document.pdf",
        type: "",
        processedFile: { pages: [], isEncrypted: true },
      }),
    ).toEqual(["PDF_ENCRYPTED"]);
  });
  describe("isPdfFile", () => {
    it("should return true for PDF files with correct MIME type", () => {
      const pdfFile = new File(["content"], "document.pdf", {
        type: "application/pdf",
      });
      expect(isPdfFile(pdfFile)).toBe(true);
    });

    it("should return true for PDF files with .pdf extension even without MIME type", () => {
      const pdfFile = new File(["content"], "document.pdf", { type: "" });
      expect(isPdfFile(pdfFile)).toBe(true);
    });

    it("should return false for non-PDF files", () => {
      const txtFile = new File(["content"], "document.txt", {
        type: "text/plain",
      });
      expect(isPdfFile(txtFile)).toBe(false);
    });

    it("should return false for image files", () => {
      const imageFile = new File(["content"], "image.png", {
        type: "image/png",
      });
      expect(isPdfFile(imageFile)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isPdfFile(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isPdfFile(undefined)).toBe(false);
    });

    it("should handle file-like objects with name and type", () => {
      const fileLike = { name: "test.pdf", type: "application/pdf" };
      expect(isPdfFile(fileLike)).toBe(true);
    });

    it("should handle file-like objects with PDF extension but no type", () => {
      const fileLike = { name: "test.pdf", type: "" };
      expect(isPdfFile(fileLike)).toBe(true);
    });
  });

  describe("detectFileExtension", () => {
    it("should detect PDF extension", () => {
      expect(detectFileExtension("document.pdf")).toBe("pdf");
    });

    it("should detect extension in uppercase", () => {
      expect(detectFileExtension("document.PDF")).toBe("pdf");
    });

    it("should return empty string for files without extension", () => {
      expect(detectFileExtension("document")).toBe("");
    });

    it("should handle multiple dots in filename", () => {
      expect(detectFileExtension("my.document.pdf")).toBe("pdf");
    });

    it("should normalize jpeg to jpg", () => {
      expect(detectFileExtension("image.jpeg")).toBe("jpg");
    });
  });

  describe("formatFileSize", () => {
    it("should format bytes", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(500)).toBe("500 B");
    });

    it("should format kilobytes", () => {
      expect(formatFileSize(1024)).toBe("1 KB");
      expect(formatFileSize(2048)).toBe("2 KB");
    });

    it("should format megabytes", () => {
      expect(formatFileSize(1024 * 1024)).toBe("1 MB");
      expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
    });

    it("should format gigabytes", () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1 GB");
    });
  });

  describe("detectNonPdfFileType", () => {
    it("should prioritize MIME type over extension when they conflict", () => {
      expect(
        detectNonPdfFileType({
          name: "financial-summary.pdf",
          type: "text/csv",
        }),
      ).toBe("csv");
      expect(
        detectNonPdfFileType({ name: "diagram.png", type: "application/json" }),
      ).toBe("json");
    });
  });
});
