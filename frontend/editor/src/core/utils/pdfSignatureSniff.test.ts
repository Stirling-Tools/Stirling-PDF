import { describe, expect, it } from "vitest";
import { hasDigitalSignature } from "@app/utils/pdfSignatureSniff";

// jsdom's Blob lacks arrayBuffer(), so give slice() one
function blobOf(text: string): Blob {
  const bytes = new TextEncoder().encode(text);
  const make = (data: Uint8Array): Blob =>
    ({
      size: data.length,
      slice: (start: number, end: number) => make(data.slice(start, end)),
      arrayBuffer: async () => data.slice().buffer,
    }) as unknown as Blob;
  return make(bytes);
}

describe("hasDigitalSignature", () => {
  it("finds a signature dictionary", async () => {
    const pdf =
      "%PDF-1.7\n5 0 obj << /Type /Sig /ByteRange [0 10 20 30] >> endobj";
    expect(await hasDigitalSignature(blobOf(pdf))).toBe(true);
  });

  it("finds a marker split across the chunk boundary", async () => {
    const pad = "x".repeat(1024 * 1024 - 4);
    expect(
      await hasDigitalSignature(blobOf(`${pad}/ByteRange [0 1 2 3]`)),
    ).toBe(true);
  });

  it("returns false for an unsigned PDF", async () => {
    expect(
      await hasDigitalSignature(blobOf("%PDF-1.7\n1 0 obj << >> endobj")),
    ).toBe(false);
  });
});
