import { describe, it, expect } from "vitest";
import { containsEncryptMarker } from "@app/utils/thumbnailUtils";

/**
 * The only signal that a PDF too large to fully parse is password-protected.
 * Tested over raw bytes because jsdom's Blob does not return its own contents
 * from arrayBuffer(), so the slicing wrapper cannot be exercised here.
 */

/** PDF-shaped bytes with `trailer` written at the very end. */
function bytesEndingWith(trailer: string, size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(0x20); // padding
  const tail = new TextEncoder().encode(trailer);
  bytes.set(tail, size - tail.length);
  return bytes;
}

describe("containsEncryptMarker — trailer probe for large PDFs", () => {
  it("detects /Encrypt in a trailer dictionary", () => {
    const bytes = bytesEndingWith(
      "trailer\n<< /Size 9 /Root 1 0 R /Encrypt 8 0 R >>\nstartxref\n1234\n%%EOF\n",
      4096,
    );
    expect(containsEncryptMarker(bytes)).toBe(true);
  });

  it("leaves an unencrypted document alone", () => {
    const bytes = bytesEndingWith(
      "trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n1234\n%%EOF\n",
      4096,
    );
    expect(containsEncryptMarker(bytes)).toBe(false);
  });

  it("does not match longer keys that merely start the same way", () => {
    const bytes = bytesEndingWith("<< /EncryptionAware true >>\n%%EOF\n", 512);
    expect(containsEncryptMarker(bytes)).toBe(false);
  });

  it("survives binary bytes around the marker", () => {
    // Under UTF-8 these become replacement characters and consume the marker.
    const prefix = new Uint8Array([0xff, 0xfe, 0x80, 0x00, 0x9d]);
    const marker = new TextEncoder().encode(" /Encrypt 8 0 R >>");
    const bytes = new Uint8Array(prefix.length + marker.length);
    bytes.set(prefix);
    bytes.set(marker, prefix.length);
    expect(containsEncryptMarker(bytes)).toBe(true);
  });

  it("reports nothing for an empty read", () => {
    expect(containsEncryptMarker(new Uint8Array(0))).toBe(false);
  });
});
