import { Blob as NodeBlob } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { readBlobSlice } from "@app/utils/blobSlice";
import { markStoredBlob } from "@app/utils/storedBlob";

const BYTES = Uint8Array.from({ length: 300_000 }, (_, i) => i % 251);

/** Node's Blob: jsdom's has no stream(), and the shared setup fakes its arrayBuffer(). */
function blobOf(bytes: Uint8Array = BYTES): Blob {
  return new NodeBlob([bytes]) as unknown as Blob;
}

async function sliced(blob: Blob, start: number, end?: number) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** A Blob whose stream serves `chunkSize`-byte chunks and counts the pulls. */
function countingBlob(chunkSize: number) {
  const blob = blobOf();
  let pulls = 0;
  let offset = 0;
  Object.defineProperty(blob, "stream", {
    value: () =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls++;
          if (offset >= BYTES.length) return controller.close();
          controller.enqueue(BYTES.subarray(offset, offset + chunkSize));
          offset += chunkSize;
        },
      }),
  });
  return { blob, pulls: () => pulls };
}

describe("readBlobSlice", () => {
  const ranges: Array<[number, number | undefined]> = [
    [0, 1],
    [0, 8],
    [0, 2_000_000],
    [70_000, 70_008],
    [BYTES.length - 65_536, undefined],
    [-8, undefined],
    [-10, -2],
    [5, 5],
    [10, 2],
  ];

  it.each(ranges)(
    "reads the same bytes as slice(%i, %s) from an ordinary blob",
    async (start, end) => {
      const blob = blobOf();
      expect(await readBlobSlice(blob, start, end)).toEqual(
        await sliced(blob, start, end),
      );
    },
  );

  it.each(ranges)(
    "reads the same bytes as slice(%i, %s) from a stored blob without slicing it",
    async (start, end) => {
      const blob = blobOf();
      const expected = await sliced(blob, start, end);
      markStoredBlob(blob);
      const slice = vi.spyOn(blob, "slice");

      expect(await readBlobSlice(blob, start, end)).toEqual(expected);
      expect(slice).not.toHaveBeenCalled();
    },
  );

  it("never slices to read a prefix, stored or not", async () => {
    const blob = blobOf();
    const slice = vi.spyOn(blob, "slice");
    await readBlobSlice(blob, 0, 8);
    expect(slice).not.toHaveBeenCalled();
  });

  it("slices an ordinary blob to read past its start", async () => {
    const blob = blobOf();
    const slice = vi.spyOn(blob, "slice");
    await readBlobSlice(blob, 1_000, 2_000);
    expect(slice).toHaveBeenCalledWith(1_000, 2_000);
  });

  it("stops reading once the prefix has arrived", async () => {
    const { blob, pulls } = countingBlob(1_024);
    expect(await readBlobSlice(blob, 0, 1)).toEqual(BYTES.subarray(0, 1));
    expect(pulls()).toBeLessThanOrEqual(2);
  });

  it("returns a view over its own exact buffer", async () => {
    const bytes = await readBlobSlice(blobOf(), 0, 4_096);
    expect(bytes.byteOffset).toBe(0);
    expect(bytes.buffer.byteLength).toBe(4_096);
  });

  it("rejects when the stored bytes cannot be read", async () => {
    const blob = blobOf();
    Object.defineProperty(blob, "stream", {
      value: () =>
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.error(new DOMException("gone", "NotReadableError"));
          },
        }),
    });
    await expect(readBlobSlice(blob, 0, 1)).rejects.toThrow("gone");
  });

  it("cancels the stream and rejects when its signal aborts mid-read", async () => {
    const blob = blobOf();
    const cancelled = vi.fn();
    Object.defineProperty(blob, "stream", {
      // Never delivers, like a store WebKit has lost.
      value: () =>
        new ReadableStream<Uint8Array>({
          pull: () => new Promise(() => {}),
          cancel: cancelled,
        }),
    });
    const controller = new AbortController();

    const read = readBlobSlice(blob, 0, 1, controller.signal);
    controller.abort();

    await expect(read).rejects.toThrow();
    expect(cancelled).toHaveBeenCalled();
  });
});
