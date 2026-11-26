import { describe, expect, it } from "vitest";
import {
  highestPdfVersion,
  keepSourcePdfVersion,
  pdfiumFileVersionToHeader,
  readPdfHeaderVersion,
} from "@editor/utils/pdfHeaderVersion";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function pdf(header: string): Uint8Array {
  return encoder.encode(`${header}\n%âã\n1 0 obj\n<<>>\nendobj\n`);
}

describe("readPdfHeaderVersion", () => {
  it("reads the header version", () => {
    expect(readPdfHeaderVersion(pdf("%PDF-2.0"))).toBe("2.0");
  });

  it("finds a header after leading junk", () => {
    expect(readPdfHeaderVersion(encoder.encode("junk\n%PDF-1.7\n"))).toBe(
      "1.7",
    );
  });

  it("returns null without a header", () => {
    expect(readPdfHeaderVersion(encoder.encode("not a pdf"))).toBeNull();
  });
});

describe("keepSourcePdfVersion", () => {
  it("raises a PDFium 1.0 header to the 2.0 source", () => {
    const output = pdf("%PDF-1.0");
    const before = output.length;
    keepSourcePdfVersion(output, "2.0");
    expect(decoder.decode(output.subarray(0, 8))).toBe("%PDF-2.0");
    expect(output.length).toBe(before);
  });

  it("patches an ArrayBuffer in place", () => {
    const output = pdf("%PDF-1.0");
    const buffer = output.buffer.slice(0) as ArrayBuffer;
    const result = keepSourcePdfVersion(buffer, "2.0");
    expect(result).toBe(buffer);
    expect(readPdfHeaderVersion(new Uint8Array(buffer))).toBe("2.0");
  });

  it("leaves a 1.7 output alone for a 1.7 source", () => {
    const output = pdf("%PDF-1.7");
    keepSourcePdfVersion(output, "1.7");
    expect(readPdfHeaderVersion(output)).toBe("1.7");
  });

  it("never lowers an output that is already newer", () => {
    const output = pdf("%PDF-1.7");
    keepSourcePdfVersion(output, "1.4");
    expect(readPdfHeaderVersion(output)).toBe("1.7");
  });

  it("leaves bytes untouched when the tokens differ in length", () => {
    const output = pdf("%PDF-1.0");
    const copy = output.slice();
    keepSourcePdfVersion(output, "2.10");
    expect(output).toEqual(copy);
  });

  it("ignores a missing source version", () => {
    const output = pdf("%PDF-1.0");
    keepSourcePdfVersion(output, null);
    expect(readPdfHeaderVersion(output)).toBe("1.0");
  });
});

describe("version helpers", () => {
  it("converts PDFium file versions", () => {
    expect(pdfiumFileVersionToHeader(20)).toBe("2.0");
    expect(pdfiumFileVersionToHeader(17)).toBe("1.7");
  });

  it("picks the highest known version", () => {
    expect(highestPdfVersion(["1.7", null, "2.0", "1.4"])).toBe("2.0");
    expect(highestPdfVersion([null])).toBeNull();
  });
});
