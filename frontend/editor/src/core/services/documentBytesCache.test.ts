/**
 * Cross-wrapper identity of the shared document-bytes cache: re-wrapped Files
 * holding the same bytes share one read, while Files with identical metadata
 * but different content must never share.
 */
import { describe, expect, it, vi } from "vitest";
import { getDocumentBytes } from "@app/services/documentBytesCache";

function fileWith(name: string, content: string): File {
  return new File([content], name, {
    type: "application/pdf",
    lastModified: 1,
  });
}

describe("getDocumentBytes", () => {
  it("shares one read across re-wrapped Files with identical bytes", async () => {
    const read = vi.spyOn(Blob.prototype, "arrayBuffer");
    try {
      const first = fileWith("doc.pdf", "same-content");
      const second = fileWith("doc.pdf", "same-content");
      const [a, b] = await Promise.all([
        getDocumentBytes(first),
        getDocumentBytes(second),
      ]);
      expect(new TextDecoder().decode(a)).toBe("same-content");
      expect(b).toBe(a);
    } finally {
      read.mockRestore();
    }
  });

  it("reads again when only the metadata matches", async () => {
    const first = fileWith("doc.pdf", "content-a");
    const second = fileWith("doc.pdf", "content-b");
    const [a, b] = await Promise.all([
      getDocumentBytes(first),
      getDocumentBytes(second),
    ]);
    expect(new TextDecoder().decode(a)).toBe("content-a");
    expect(new TextDecoder().decode(b)).toBe("content-b");
    expect(b).not.toBe(a);
  });
});
