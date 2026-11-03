import { describe, it, expect, vi } from "vitest";
import {
  containsEncryptMarker,
  looksEncryptedFromTrailer,
} from "@editor/utils/pdfEncryptionProbe";

/** PDF-shaped bytes with `trailer` written at the very end. */
function bytesEndingWith(trailer: string, size: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(0x20); // padding
  const tail = new TextEncoder().encode(trailer);
  bytes.set(tail, size - tail.length);
  return bytes;
}

describe("PDF encryption marker probe", () => {
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

describe("bounded encryption reads", () => {
  it.each(["head", "tail", "absent"])(
    "checks %s without reading the whole file",
    async (location) => {
      const bytes = new Uint8Array(256 * 1024).fill(0x20);
      if (location !== "absent") {
        const marker = new TextEncoder().encode(" /Encrypt 8 0 R ");
        bytes.set(
          marker,
          location === "head" ? 0 : bytes.length - marker.length,
        );
      }
      const file = new File([bytes], "document.pdf");
      const readAll = vi.spyOn(file, "arrayBuffer");
      const slices = vi
        .spyOn(file, "slice")
        .mockImplementation((start, end) => {
          const part = bytes.slice(start, end);
          expect(part.length).toBeLessThanOrEqual(64 * 1024);
          return { arrayBuffer: async () => part.buffer } as Blob;
        });
      expect(await looksEncryptedFromTrailer(file)).toBe(location !== "absent");
      expect(readAll).not.toHaveBeenCalled();
      expect(slices).toHaveBeenCalledTimes(location === "tail" ? 1 : 2);
    },
  );
});
