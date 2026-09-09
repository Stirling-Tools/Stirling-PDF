import { describe, expect, it } from "vitest";
import { uploadableFile } from "@app/utils/uploadableFile";

/** jsdom's Blob has no text(). */
const textOf = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });

describe("uploadableFile", () => {
  const source = new File(["%PDF-1.7 body"], "report.pdf", {
    type: "application/pdf",
    lastModified: 1_700_000_000_000,
  });

  it("returns a distinct File object", () => {
    expect(uploadableFile(source)).not.toBe(source);
  });

  it("keeps the identity fields the server and the run record read", () => {
    const wrapped = uploadableFile(source);
    expect(wrapped.name).toBe(source.name);
    expect(wrapped.type).toBe(source.type);
    expect(wrapped.lastModified).toBe(source.lastModified);
    expect(wrapped.size).toBe(source.size);
  });

  it("carries the same bytes", async () => {
    expect(await textOf(uploadableFile(source))).toBe(await textOf(source));
  });
});
