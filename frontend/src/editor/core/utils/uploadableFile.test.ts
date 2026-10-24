import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadableFile } from "@app/utils/uploadableFile";
import { markStoredBlob } from "@app/utils/storedBlob";

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

  afterEach(() => vi.unstubAllGlobals());

  it("returns a distinct File object", async () => {
    expect(await uploadableFile(source)).not.toBe(source);
  });

  it("keeps the identity fields the server and the run record read", async () => {
    const wrapped = await uploadableFile(source);
    expect(wrapped.name).toBe(source.name);
    expect(wrapped.type).toBe(source.type);
    expect(wrapped.lastModified).toBe(source.lastModified);
    expect(wrapped.size).toBe(source.size);
  });

  it("carries the same bytes", async () => {
    expect(await textOf(await uploadableFile(source))).toBe(
      await textOf(source),
    );
  });

  it("copies a File that came out of IndexedDB instead of wrapping it", async () => {
    // Node's File: jsdom's has no stream() to copy through.
    vi.stubGlobal("File", NodeFile);
    vi.stubGlobal("Blob", NodeBlob);
    const stored = new File(["%PDF-1.7 stored"], "stored.pdf", {
      type: "application/pdf",
    });
    markStoredBlob(stored);
    const stream = vi.spyOn(stored, "stream");
    const slice = vi.spyOn(stored, "slice");

    const upload = await uploadableFile(stored);

    expect(stream).toHaveBeenCalledOnce();
    expect(slice).not.toHaveBeenCalled();
    expect(await upload.text()).toBe("%PDF-1.7 stored");
  });
});
