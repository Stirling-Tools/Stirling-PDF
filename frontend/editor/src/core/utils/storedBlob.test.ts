import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detachedFile,
  detachedFormData,
  isStoredBlob,
  markStoredBlob,
} from "@app/utils/storedBlob";

function pdf(name = "report.pdf"): File {
  return new File(["%PDF-1.7 body"], name, {
    type: "application/pdf",
    lastModified: 1_700_000_000_000,
  });
}

function storedPdf(name?: string): File {
  const stored = pdf(name);
  markStoredBlob(stored);
  return stored;
}

describe("markStoredBlob", () => {
  it("marks the blob, not ones with the same bytes", () => {
    const stored = storedPdf();
    expect(isStoredBlob(stored)).toBe(true);
    expect(isStoredBlob(pdf())).toBe(false);
  });
});

describe("detachedFile", () => {
  // Node's File and Blob: jsdom's have no stream(), and the shared setup fakes
  // their arrayBuffer(), so a copy could not be told from the original.
  beforeEach(() => {
    vi.stubGlobal("File", NodeFile);
    vi.stubGlobal("Blob", NodeBlob);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["an ordinary blob", () => pdf()],
    ["a stored blob", () => storedPdf()],
  ])("keeps the identity fields and the bytes of %s", async (_, make) => {
    const source = make();
    const file = await detachedFile(source);
    expect(file).not.toBe(source);
    expect(file.name).toBe(source.name);
    expect(file.type).toBe(source.type);
    expect(file.lastModified).toBe(source.lastModified);
    expect(await file.text()).toBe(await source.text());
  });

  it("takes a new identity where one is given", async () => {
    const file = await detachedFile(pdf(), {
      name: "renamed.pdf",
      type: "application/x-pdf",
      lastModified: 42,
    });
    expect([file.name, file.type, file.lastModified]).toEqual([
      "renamed.pdf",
      "application/x-pdf",
      42,
    ]);
  });

  it("copies a stored blob through its stream, never slicing it", async () => {
    const stored = storedPdf();
    const stream = vi.spyOn(stored, "stream");
    const slice = vi.spyOn(stored, "slice");

    await detachedFile(stored);

    expect(stream).toHaveBeenCalledOnce();
    expect(slice).not.toHaveBeenCalled();
  });

  it("only references an ordinary blob", async () => {
    const source = pdf();
    const stream = vi.spyOn(source, "stream");
    await detachedFile(source);
    expect(stream).not.toHaveBeenCalled();
  });

  it("copies an ordinary blob when asked to", async () => {
    const source = pdf();
    const stream = vi.spyOn(source, "stream");
    await detachedFile(source, { alwaysCopy: true });
    expect(stream).toHaveBeenCalledOnce();
  });
});

describe("detachedFormData", () => {
  it("replaces every file entry and keeps order, fields and filenames", async () => {
    const stored = storedPdf("stored.pdf");
    const other = pdf("second.pdf");
    const form = new FormData();
    form.append("fileInput", stored);
    form.append("pageNumbers", "1-3");
    form.append("fileInput", other, "named-on-append.pdf");

    const entries = [...(await detachedFormData(form)).entries()];

    expect(entries.map(([key]) => key)).toEqual([
      "fileInput",
      "pageNumbers",
      "fileInput",
    ]);
    expect(entries[1][1]).toBe("1-3");
    const [first, , second] = entries.map(([, value]) => value as File);
    expect(first).not.toBe(stored);
    expect(second).not.toBe(other);
    expect(first.name).toBe("stored.pdf");
    expect(second.name).toBe("named-on-append.pdf");
    expect(first.type).toBe("application/pdf");
  });
});
