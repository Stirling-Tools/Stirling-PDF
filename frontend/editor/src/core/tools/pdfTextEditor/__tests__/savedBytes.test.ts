import { describe, expect, it } from "vitest";
import {
  assertIncrementalAppend,
  assertSavedPdf,
} from "@app/tools/pdfTextEditor/util/savedBytes";

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

/** A byte string long enough to clear the minimum-length check. */
function pdf(body = "x".repeat(400), tail = "\n%%EOF\n"): Uint8Array {
  return ascii(`%PDF-1.7\n${body}${tail}`);
}

describe("assertSavedPdf", () => {
  it("accepts a plausible PDF", () => {
    expect(() => assertSavedPdf(pdf())).not.toThrow();
  });

  it("rejects the empty buffer a failed writer hands back", () => {
    expect(() => assertSavedPdf(new Uint8Array(0))).toThrow(/too short/i);
  });

  it("rejects a truncated write", () => {
    expect(() => assertSavedPdf(ascii("%PDF-1.7\n%%EOF\n"))).toThrow(
      /too short/i,
    );
  });

  it("rejects data that is not a PDF at all", () => {
    expect(() => assertSavedPdf(ascii("N".repeat(2048)))).toThrow(
      /PDF header/i,
    );
  });

  it("rejects a PDF with no end-of-file marker", () => {
    expect(() => assertSavedPdf(pdf("x".repeat(400), "\n"))).toThrow(
      /end-of-file/i,
    );
  });

  it("rejects an EOF marker buried far from the end", () => {
    // %%EOF followed by 8k of padding: the real terminator is missing.
    expect(() => assertSavedPdf(pdf("%%EOF" + "\0".repeat(8192), ""))).toThrow(
      /end-of-file/i,
    );
  });
});

describe("assertIncrementalAppend", () => {
  const original = pdf();

  it("accepts bytes that only appended a revision", () => {
    const appended = new Uint8Array(original.length + 32);
    appended.set(original);
    appended.set(ascii("\n1 0 obj\n<<>>\nendobj\n%%EOF\n"), original.length);
    expect(() => assertIncrementalAppend(appended, original)).not.toThrow();
  });

  it("accepts a byte-identical save", () => {
    expect(() => assertIncrementalAppend(original, original)).not.toThrow();
  });

  it("rejects a save shorter than the revision it must preserve", () => {
    expect(() =>
      assertIncrementalAppend(original.slice(0, original.length - 1), original),
    ).toThrow(/shorter/i);
  });

  it("rejects a full rewrite that changed the signed bytes", () => {
    const rewritten = new Uint8Array(original);
    rewritten[100] = rewritten[100] ^ 0xff;
    expect(() => assertIncrementalAppend(rewritten, original)).toThrow(
      /byte 100/,
    );
  });
});
