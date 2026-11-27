import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readCipherProfile } from "@editor/utils/pdfCipherProfile";

const fixture = (name: string) =>
  new Blob([
    new Uint8Array(
      fs.readFileSync(
        path.join(import.meta.dirname, "../tests/test-fixtures", name),
      ),
    ),
  ]);

describe("readCipherProfile", () => {
  // jsdom's Blob.arrayBuffer does not return the stored bytes.
  beforeEach(() => {
    vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(
      function (this: Blob) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.readAsArrayBuffer(this);
        });
      },
    );
  });

  it("matches PDFs that share a cipher despite different owner passwords", async () => {
    const first = await readCipherProfile(
      fixture("owner-only-unrestricted-a.pdf"),
    );
    expect(first).toBeDefined();
    expect(
      await readCipherProfile(fixture("owner-only-unrestricted-b.pdf")),
    ).toBe(first);
  });

  it("distinguishes RC4 from AES protection", async () => {
    expect(
      await readCipherProfile(fixture("owner-only-restricted.pdf")),
    ).not.toBe(
      await readCipherProfile(fixture("owner-only-unrestricted-a.pdf")),
    );
  });

  it("returns undefined for unencrypted or unreadable input", async () => {
    expect(await readCipherProfile(fixture("sample.pdf"))).toBeUndefined();
    expect(await readCipherProfile(new Blob(["not a pdf"]))).toBeUndefined();
  });
});
