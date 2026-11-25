import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createStirlingFile } from "@editor/types/fileContext";
import {
  cachePdfAccess,
  readCachedPdfAccess,
} from "@editor/services/pdfProbeCache";
import type { PdfAccess } from "@editor/services/pdfAccessService";

const facts: PdfAccess = {
  password: "",
  encrypted: false,
  signed: true,
  ownerAuthenticated: false,
  permissions: -1,
  encryptionRevision: -1,
  pageCount: 3,
};
const pdf = (lastModified: number, body = "%PDF-1.7") =>
  new File([body], "contract.pdf", { type: "application/pdf", lastModified });

async function stored(file: File) {
  await expect.poll(() => readCachedPdfAccess(file)).toBeDefined();
  return readCachedPdfAccess(file);
}

describe("probe facts cache", () => {
  it("returns the facts of the same stored file after a reload", async () => {
    const file = createStirlingFile(pdf(1));
    cachePdfAccess(file, facts);
    await expect(stored(file)).resolves.toMatchObject({
      signed: true,
      pageCount: 3,
      encrypted: false,
      password: "",
    });
  });

  it("ignores the entry once the bytes under that id have changed", async () => {
    const original = createStirlingFile(pdf(2));
    cachePdfAccess(original, facts);
    await stored(original);
    const reloaded = createStirlingFile(
      pdf(3, "%PDF-1.7 edited"),
      original.fileId,
    );
    await expect(readCachedPdfAccess(reloaded)).resolves.toBeUndefined();
  });

  it("never stores encrypted files or files without an id", async () => {
    const encrypted = createStirlingFile(pdf(4));
    cachePdfAccess(encrypted, { ...facts, encrypted: true });
    await expect(readCachedPdfAccess(encrypted)).resolves.toBeUndefined();
    expect(readCachedPdfAccess(pdf(5))).toBeUndefined();
  });
});
