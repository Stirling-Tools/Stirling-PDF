import { describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";

import {
  readPortfolioMemberBytes,
  readPortfolioMembers,
} from "@app/utils/portfolioMembers";
import { getDocumentBytes } from "@app/services/documentBytesCache";

const buildPdf = async (options: {
  collection: boolean;
  members?: { name: string; mimeType: string; body: string }[];
}): Promise<File> => {
  const doc = await PDFDocument.create();
  doc.addPage();
  for (const member of options.members ?? []) {
    await doc.attach(new TextEncoder().encode(member.body), member.name, {
      mimeType: member.mimeType,
    });
  }
  if (options.collection) {
    doc.catalog.set(PDFName.of("Collection"), doc.context.obj({}));
  }
  const bytes = await doc.save();
  const file = new File([bytes as BlobPart], "portfolio.pdf", {
    type: "application/pdf",
  });
  // setupTests stubs Blob.arrayBuffer with fixed bytes, which no parser can read.
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    writable: true,
    value: async () => bytes.buffer.slice(0) as ArrayBuffer,
  });
  return file;
};

describe("readPortfolioMembers", () => {
  it("decodes a member's mime type rather than returning the escaped name token", async () => {
    const file = await buildPdf({
      collection: true,
      members: [{ name: "report.log", mimeType: "text/plain", body: "hello" }],
    });

    const members = await readPortfolioMembers(file);

    expect(members).toHaveLength(1);
    expect(members?.[0].mimeType).toBe("text/plain");
  });

  it("returns null for a PDF that is not a portfolio", async () => {
    const file = await buildPdf({ collection: false });

    expect(await readPortfolioMembers(file)).toBeNull();
  });

  it("shares a single document-bytes read across repeated scans", async () => {
    const file = await buildPdf({ collection: false });
    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    await readPortfolioMembers(file);
    await readPortfolioMemberBytes(file, "anything");

    // Both scans go through documentBytesCache: one full-file copy total.
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
  });

  it("keeps a portfolio cached so reading a member does not reparse it", async () => {
    const file = await buildPdf({
      collection: true,
      members: [{ name: "note.txt", mimeType: "text/plain", body: "hello" }],
    });
    await readPortfolioMembers(file);

    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    const bytes = await readPortfolioMemberBytes(file, "note.txt");

    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("hello");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
});

describe("getDocumentBytes", () => {
  it("returns the same buffer for the same Blob without re-reading", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });

    const first = await getDocumentBytes(blob);
    const second = await getDocumentBytes(blob);

    expect(second).toBe(first);
    expect(first.byteLength).toBeGreaterThan(0);
  });

  it("shares reads across re-wrapped Files with identical identity metadata", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const bytes = await doc.save();
    const lastModified = 1726500000000;
    const first = new File([bytes as BlobPart], "shared-doc.pdf", {
      type: "application/pdf",
      lastModified,
    });
    const second = new File([bytes as BlobPart], "shared-doc.pdf", {
      type: "application/pdf",
      lastModified,
    });
    const secondRead = vi.spyOn(second, "arrayBuffer");

    await getDocumentBytes(first);
    const shared = await getDocumentBytes(second);

    expect(shared).toBe(await getDocumentBytes(first));
    // Resolved from the file-key tier: no second full-file copy.
    expect(secondRead).not.toHaveBeenCalled();
  });
});
