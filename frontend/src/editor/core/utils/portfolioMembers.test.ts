// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";

import {
  readPortfolioMemberBytes,
  readPortfolioMembers,
} from "@editor/utils/portfolioMembers";

const EMPTY_PASSWORD_PORTFOLIO = path.join(
  import.meta.dirname,
  "../tests/test-fixtures/portfolio-aes-empty-password.pdf",
);

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
    value: async () => bytes.buffer.slice(0),
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

  it("lists the members of a portfolio that is encrypted with an empty user password", async () => {
    // An AES-128 portfolio with an empty user password, the way Acrobat Sign
    // ships one. See test-fixtures/README.md for how it was made.
    const bytes = new Uint8Array(await readFile(EMPTY_PASSWORD_PORTFOLIO));
    const file = new File([bytes], "portfolio.pdf", {
      type: "application/pdf",
    });
    Object.defineProperty(file, "arrayBuffer", {
      configurable: true,
      writable: true,
      value: async () => bytes.buffer.slice(0),
    });

    const members = await readPortfolioMembers(file);

    expect(members?.map((member) => member.name)).toEqual([
      "first.txt",
      "second.txt",
    ]);
    expect(await readPortfolioMemberBytes(file, "first.txt")).toEqual(
      new TextEncoder().encode("first member body"),
    );
  });

  it("returns null for a PDF that is not a portfolio", async () => {
    const file = await buildPdf({ collection: false });

    expect(await readPortfolioMembers(file)).toBeNull();
  });

  it("does not keep a non-portfolio's parsed bytes cached", async () => {
    const file = await buildPdf({ collection: false });
    await readPortfolioMembers(file);

    const arrayBuffer = vi.spyOn(file, "arrayBuffer");
    await readPortfolioMemberBytes(file, "anything");

    expect(arrayBuffer).toHaveBeenCalled();
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
