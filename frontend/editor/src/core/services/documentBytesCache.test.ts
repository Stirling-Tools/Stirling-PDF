/** Contract of the shared document-bytes cache: one read per live Blob (or per
 * identical File wrapper), concurrent callers share it, a failed read is
 * retryable, and `releaseDocumentBytes` drops the entry. Each Blob's
 * `arrayBuffer` is stubbed with the bytes it stands for, so the assertions do
 * not depend on the global jsdom Blob mock. */
import { describe, expect, it, vi } from "vitest";
import {
  getDocumentBytes,
  releaseDocumentBytes,
} from "@app/services/documentBytesCache";

const bytesOf = (bytes: number[]): ArrayBuffer => new Uint8Array(bytes).buffer;

const makeFile = (name: string, bytes: number[], lastModified = 1000) =>
  new File([new Uint8Array(bytes)], name, {
    type: "application/pdf",
    lastModified,
  });

describe("documentBytesCache", () => {
  it("serves one read per live Blob and returns the same bytes", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const spy = vi
      .spyOn(blob, "arrayBuffer")
      .mockResolvedValue(bytesOf([1, 2, 3]));

    const first = await getDocumentBytes(blob);
    const second = await getDocumentBytes(blob);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(Array.from(new Uint8Array(first))).toEqual([1, 2, 3]);
  });

  it("deduplicates concurrent reads", async () => {
    const blob = new Blob([new Uint8Array([9])]);
    const spy = vi.spyOn(blob, "arrayBuffer").mockResolvedValue(bytesOf([9]));

    const [a, b] = await Promise.all([
      getDocumentBytes(blob),
      getDocumentBytes(blob),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("shares one read across File wrappers with identical metadata", async () => {
    const first = makeFile("wrapped-once.pdf", [1, 2, 3]);
    const second = makeFile("wrapped-once.pdf", [1, 2, 3]);
    const firstSpy = vi
      .spyOn(first, "arrayBuffer")
      .mockResolvedValue(bytesOf([1, 2, 3]));
    const secondSpy = vi
      .spyOn(second, "arrayBuffer")
      .mockResolvedValue(bytesOf([1, 2, 3]));

    const [a, b] = await Promise.all([
      getDocumentBytes(first),
      getDocumentBytes(second),
    ]);

    expect(a).toBe(b);
    expect(firstSpy.mock.calls.length + secondSpy.mock.calls.length).toBe(1);
  });

  it("re-reads when a File's metadata changes", async () => {
    const original = makeFile("mtime.pdf", [1, 2, 3], 1000);
    const edited = makeFile("mtime.pdf", [4, 5, 6], 2000);
    vi.spyOn(original, "arrayBuffer").mockResolvedValue(bytesOf([1, 2, 3]));
    vi.spyOn(edited, "arrayBuffer").mockResolvedValue(bytesOf([4, 5, 6]));

    const a = await getDocumentBytes(original);
    const b = await getDocumentBytes(edited);

    expect(b).not.toBe(a);
    expect(Array.from(new Uint8Array(b))).toEqual([4, 5, 6]);
  });

  it("keeps bare Blobs identity-keyed (size alone must not share)", async () => {
    const a = new Blob([new Uint8Array([1, 2, 3])]);
    const b = new Blob([new Uint8Array([4, 5, 6])]);
    vi.spyOn(a, "arrayBuffer").mockResolvedValue(bytesOf([1, 2, 3]));
    vi.spyOn(b, "arrayBuffer").mockResolvedValue(bytesOf([4, 5, 6]));

    const first = await getDocumentBytes(a);
    const second = await getDocumentBytes(b);

    expect(second).not.toBe(first);
    expect(Array.from(new Uint8Array(second))).toEqual([4, 5, 6]);
  });

  it("re-reads after releaseDocumentBytes", async () => {
    const file = makeFile("released.pdf", [7, 8, 9]);
    const spy = vi
      .spyOn(file, "arrayBuffer")
      .mockImplementation(() => Promise.resolve(bytesOf([7, 8, 9])));

    const first = await getDocumentBytes(file);
    releaseDocumentBytes(file);
    const second = await getDocumentBytes(file);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(Array.from(new Uint8Array(second))).toEqual([7, 8, 9]);
    expect(second).not.toBe(first);
  });

  it("does not cache a failed read, so a retry re-reads", async () => {
    const blob = new Blob([new Uint8Array([1])]);
    const spy = vi
      .spyOn(blob, "arrayBuffer")
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue(bytesOf([1]));

    await expect(getDocumentBytes(blob)).rejects.toThrow("nope");
    const buffer = await getDocumentBytes(blob);
    expect(buffer.byteLength).toBe(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not share bytes across identical metadata with different content", async () => {
    const bytesA = new Uint8Array([1, 2, 3, 4]);
    const bytesB = new Uint8Array([9, 8, 7, 6]);
    const stubSlices = (file: File, bytes: Uint8Array) => {
      vi.spyOn(file, "slice").mockImplementation(
        (start?: number, end?: number) => {
          const part = bytes.slice(start ?? 0, end ?? bytes.length);
          return {
            size: part.length,
            arrayBuffer: async () =>
              part.buffer.slice(
                part.byteOffset,
                part.byteOffset + part.byteLength,
              ),
          } as unknown as Blob;
        },
      );
      return file;
    };
    const first = stubSlices(makeFile("same.pdf", [1, 2, 3, 4]), bytesA);
    const second = stubSlices(makeFile("same.pdf", [9, 8, 7, 6]), bytesB);
    const firstSpy = vi
      .spyOn(first, "arrayBuffer")
      .mockResolvedValue(bytesA.buffer);
    const secondSpy = vi
      .spyOn(second, "arrayBuffer")
      .mockResolvedValue(bytesB.buffer);

    const a = await getDocumentBytes(first);
    const b = await getDocumentBytes(second);

    expect(firstSpy).toHaveBeenCalledTimes(1);
    expect(secondSpy).toHaveBeenCalledTimes(1);
    expect(a).not.toBe(b);
  });
});
