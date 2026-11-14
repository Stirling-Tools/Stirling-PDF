// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFName } from "@cantoo/pdf-lib";

import {
  readPortfolioMemberBytes,
  readPortfolioMembers,
} from "@editor/utils/portfolioMembers";

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
    // Two-text portfolio made with pdf-lib and a /Collection, then encrypted with
    // an empty user password, the way Acrobat Sign ships a portfolio:
    // qpdf --encrypt "" owner 128 --use-aes=y -- portfolio.pdf portfolio-aes.pdf
    const bytes = Uint8Array.from(
      atob(
        "JVBERi0xLjcKJb/3ov4KMSAwIG9iago8PCAvQUYgWyA0IDAgUiA1IDAgUiBdIC9Db2xsZWN0aW9uIDw8ID4+IC9OYW1lcyA8PCAvRW1iZWRkZWRGaWxlcyA8PCAvTmFtZXMgWyA8MGE0MzNiOTkzNWJmYTFmMjMyMTMwNzdjNmVmZTc5ODRiODdkMWRkYTdkOTFjYzU5NGQ5MTA3YjUxNWQ3OGM2MDZkMGQ4YWQ4NWRmZjE5ZGVmZmM0YjQ4ZjUyZjZjZDgxPiA0IDAgUiA8MmNmODQ0NzYxOGUzNGMwMWVkNWQ4ODc5MmFmZGM4ODI3N2Q3OGFjNDY0MmI1NDVkMWZlODNlODgxZGMzYTAwYWE3NGY2ZGI4ZTM2OTA4ZTQxYzYzMzE4MDE1MmFlODVjPiA1IDAgUiBdID4+ID4+IC9QYWdlcyA2IDAgUiAvVHlwZSAvQ2F0YWxvZyA+PgplbmRvYmoKMiAwIG9iago8PCAvVHlwZSAvT2JqU3RtIC9MZW5ndGggMjcyIC9GaWx0ZXIgL0ZsYXRlRGVjb2RlIC9OIDMgL0ZpcnN0IDE2ID4+CnN0cmVhbQorUHt+L/BeknSzmI/yzmjCtU3FnzfxxOs8laKuCU7yOsvJxYahED9HdRHJcd1snOrdeT68kPur2szoDszeDLEJb/4p/5pzFqntws71cWZ4/Q7lRs+WlR4snyXCayClV8OlloVzZNamKedWygEa9NGROGiLIR4u8i9ax4tRHkdB/4hhnLrDYAHMdtyYAHZPqi0NzVIuwCcMO7hhA+X+jqG9myumdw2DkyF4MeLieBKWwn2tTAYpdbs1+T7t07DVzq7MLicTelrgZk5vEcfmuCDlx91l0gmUvxJq8I6BoE4OTzyhfXGQ6gFaICJwdEIyzBgJN8iRHs4YMr6VgZzcoOS32omjuhY5rxtOl3bp8bdZrWVuZHN0cmVhbQplbmRvYmoKNiAwIG9iago8PCAvQ291bnQgMSAvS2lkcyBbIDkgMCBSIF0gL1R5cGUgL1BhZ2VzID4+CmVuZG9iago3IDAgb2JqCjw8IC9GaWx0ZXIgL0ZsYXRlRGVjb2RlIC9QYXJhbXMgPDwgL1NpemUgMTcgPj4gL1N1YnR5cGUgL3RleHQjMmZwbGFpbiAvVHlwZSAvRW1iZWRkZWRGaWxlIC9MZW5ndGggNDggPj4Kc3RyZWFtCtqHLYgDfMQXV5u35J58c84xaLY3frPq5km+8jpBHY7DJJcDgc0RrKxkUw81KMutMmVuZHN0cmVhbQplbmRvYmoKOCAwIG9iago8PCAvRmlsdGVyIC9GbGF0ZURlY29kZSAvUGFyYW1zIDw8IC9TaXplIDE4ID4+IC9TdWJ0eXBlIC90ZXh0IzJmcGxhaW4gL1R5cGUgL0VtYmVkZGVkRmlsZSAvTGVuZ3RoIDQ4ID4+CnN0cmVhbQrLK3KrQMIBWIvf2Oc7atrJeP+polXXpQAzgbRV2EJ2sQSZ+yuMDc72dAXiiCSwSMllbmRzdHJlYW0KZW5kb2JqCjkgMCBvYmoKPDwgL01lZGlhQm94IFsgMCAwIDU5NS4yOCA4NDEuODkgXSAvUGFyZW50IDYgMCBSIC9SZXNvdXJjZXMgPDwgPj4gL1R5cGUgL1BhZ2UgPj4KZW5kb2JqCjEwIDAgb2JqCjw8IC9DRiA8PCAvU3RkQ0YgPDwgL0F1dGhFdmVudCAvRG9jT3BlbiAvQ0ZNIC9BRVNWMiAvTGVuZ3RoIDE2ID4+ID4+IC9GaWx0ZXIgL1N0YW5kYXJkIC9MZW5ndGggMTI4IC9PIDw1NjZmYTg3M2VlMzNjNzk3Y2QzYjkwNGZkYWRmODE0YWZhMzRkZjlhMzhmNmVkNDFiOTg0ZTJjNmRhMmFhNmY1PiAvUCAtNCAvUiA0IC9TdG1GIC9TdGRDRiAvU3RyRiAvU3RkQ0YgL1UgPGRmYzQzMzYxMGU1M2EyZmU2NWM5OGM1ZDYwZTJiYWM1MDEyMjQ1NmE5MWJhZTUxMzQyNzNhNmRiMTM0Yzg3YzQ+IC9WIDQgPj4KZW5kb2JqCjExIDAgb2JqCjw8IC9UeXBlIC9YUmVmIC9MZW5ndGggNTEgL0ZpbHRlciAvRmxhdGVEZWNvZGUgL0RlY29kZVBhcm1zIDw8IC9Db2x1bW5zIDQgL1ByZWRpY3RvciAxMiA+PiAvVyBbIDEgMiAxIF0gL0luZm8gMyAwIFIgL1Jvb3QgMSAwIFIgL1NpemUgMTIgL0lEIFs8MjY0OTZjZmU0MzcxMTAwNWEwNjg3ZTFkZGNjMWFmYmE+PDI2NDk2Y2ZlNDM3MTEwMDVhMDY4N2UxZGRjYzFhZmJhPl0gL0VuY3J5cHQgMTAgMCBSID4+CnN0cmVhbQp4nGNiAAImRgZ+BiYGxjAg6/9cIIuBgRFC/Ge6/g8oYQ0S2wFSAiIYEoAEkw4DAMYqBzAKZW5kc3RyZWFtCmVuZG9iagpzdGFydHhyZWYKMTU1MgolJUVPRgo=",
      ),
      (char) => char.charCodeAt(0),
    );
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
