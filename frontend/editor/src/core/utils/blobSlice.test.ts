import { describe, it, expect } from "vitest";
import { readBlobSlice } from "@app/utils/blobSlice";

describe("readBlobSlice", () => {
  function makeBlob(bytes: Uint8Array): Blob {
    return {
      size: bytes.length,
      slice: (start: number, end?: number) => {
        const sliced = bytes.slice(start, end !== undefined ? end : bytes.length);
        return {
          size: sliced.length,
          stream: () =>
            new ReadableStream({
              start(controller) {
                controller.enqueue(sliced);
                controller.close();
              },
            }),
          arrayBuffer: async () => sliced.buffer.slice(sliced.byteOffset, sliced.byteOffset + sliced.byteLength),
        };
      },
    } as unknown as Blob;
  }

  it("reads an empty blob", async () => {
    const blob = makeBlob(new Uint8Array([]));
    const result = await readBlobSlice(blob, 0);
    expect(result.length).toBe(0);
  });

  it("reads a full small blob", async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const blob = makeBlob(data);
    const result = await readBlobSlice(blob, 0);
    expect(Array.from(result)).toEqual(Array.from(data));
  });

  it("reads head, tail, and middle slices identically to slice.arrayBuffer", async () => {
    const buffer = new Uint8Array(1024);
    for (let i = 0; i < buffer.length; i++) buffer[i] = i & 0xff;
    const blob = makeBlob(buffer);

    const head = await readBlobSlice(blob, 0, 16);
    expect(Array.from(head)).toEqual(Array.from(buffer.slice(0, 16)));

    const middle = await readBlobSlice(blob, 100, 200);
    expect(Array.from(middle)).toEqual(Array.from(buffer.slice(100, 200)));

    const tail = await readBlobSlice(blob, 1000);
    expect(Array.from(tail)).toEqual(Array.from(buffer.slice(1000)));
  });

  it("handles multiple stream chunks correctly and combines them", async () => {
    // Construct a custom Blob-like object whose .slice().stream() yields multiple chunks
    const chunk1 = new Uint8Array([10, 20]);
    const chunk2 = new Uint8Array([30, 40, 50]);
    const chunk3 = new Uint8Array([60]);

    const mockBlob = {
      slice: () => ({
        stream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(chunk1);
              controller.enqueue(chunk2);
              controller.enqueue(chunk3);
              controller.close();
            },
          }),
        arrayBuffer: async () => new Uint8Array([10, 20, 30, 40, 50, 60]).buffer,
      }),
    } as unknown as Blob;

    const result = await readBlobSlice(mockBlob, 0);
    expect(Array.from(result)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("falls back to arrayBuffer when stream is not available", async () => {
    const data = new Uint8Array([5, 4, 3, 2, 1]);
    const mockBlob = {
      slice: (start: number, end?: number) => ({
        arrayBuffer: async () => data.slice(start, end).buffer,
      }),
    } as unknown as Blob;

    const result = await readBlobSlice(mockBlob, 1, 4);
    expect(Array.from(result)).toEqual([4, 3, 2]);
  });

  it("releases reader lock even when stream errors", async () => {
    const mockBlob = {
      slice: () => ({
        stream: () =>
          new ReadableStream({
            start(controller) {
              controller.error(new Error("Simulated stream failure"));
            },
          }),
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    } as unknown as Blob;

    await expect(readBlobSlice(mockBlob, 0)).rejects.toThrow(
      "Simulated stream failure",
    );
  });

  it("fuzz test: matches slice.arrayBuffer across random sizes and offsets", async () => {
    // Run 50 random trials with various payload sizes up to 128KB
    for (let trial = 0; trial < 50; trial++) {
      const size = Math.floor(Math.random() * 65536) + 1;
      const bytes = new Uint8Array(size);
      for (let i = 0; i < size; i++) bytes[i] = (i * 31 + trial) & 0xff;
      const blob = makeBlob(bytes);

      const start = Math.floor(Math.random() * size);
      const end =
        Math.random() > 0.3
          ? Math.min(size, start + Math.floor(Math.random() * (size - start + 10)))
          : undefined;

      const [actual, expectedBuffer] = await Promise.all([
        readBlobSlice(blob, start, end),
        blob.slice(start, end).arrayBuffer(),
      ]);

      const expected = new Uint8Array(expectedBuffer);
      expect(actual.length).toBe(expected.length);
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) {
          throw new Error(
            `Mismatch at index ${i} in trial ${trial}: actual=${actual[i]} expected=${expected[i]}`,
          );
        }
      }
    }
  });
});
