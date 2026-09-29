import { describe, it, expect } from "vitest";
import { containsEncryptMarker } from "@app/utils/thumbnailUtils";
import {
  PdfiumOpenError,
  FPDF_ERR_PASSWORD,
} from "@app/services/pdfiumService";

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

/**
 * thumbnailUtils identifies password-protected PDFs from the error that
 * openRawDocumentSafe throws. That guard used to regex the error *message* for
 * "error 4"; when the message changed the detection silently stopped firing
 * with no test failing. These pin the contract it now relies on instead.
 */
describe("encrypted-PDF identification contract", () => {
  it("marks a password failure with the password code", () => {
    const err = new PdfiumOpenError(FPDF_ERR_PASSWORD);
    expect(err).toBeInstanceOf(PdfiumOpenError);
    expect(err.code).toBe(FPDF_ERR_PASSWORD);
  });

  it("does not mistake another open failure for a password prompt", () => {
    expect(new PdfiumOpenError(2).code).not.toBe(FPDF_ERR_PASSWORD);
  });

  it("carries the code out of band, not in the message", () => {
    // Guarding on message text is what broke before - assert it stays unrelied on.
    expect(new PdfiumOpenError(FPDF_ERR_PASSWORD).message).not.toContain(
      `error ${FPDF_ERR_PASSWORD}`,
    );
  });
});
