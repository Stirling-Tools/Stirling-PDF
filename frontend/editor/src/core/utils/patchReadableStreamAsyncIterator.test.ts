import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { patchReadableStreamAsyncIterator } from "@app/utils/patchReadableStreamAsyncIterator";

/** Node implements the API, so remove it to exercise the shim, then restore. */
const KEY: PropertyKey = Symbol.asyncIterator;
const proto: object = ReadableStream.prototype;
let native: PropertyDescriptor | undefined;

beforeEach(() => {
  native = Object.getOwnPropertyDescriptor(proto, KEY);
  Reflect.deleteProperty(proto, KEY);
  patchReadableStreamAsyncIterator();
});

afterEach(() => {
  if (native) Object.defineProperty(proto, KEY, native);
});

function streamOf(...chunks: number[]): ReadableStream<number> {
  return new ReadableStream<number>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(c));
      controller.close();
    },
  });
}

function failingStream(error: Error): ReadableStream<number> {
  return new ReadableStream<number>({
    start(controller) {
      controller.enqueue(1);
      controller.error(error);
    },
  });
}

describe("patchReadableStreamAsyncIterator", () => {
  it("drains a stream with for await, then unlocks it", async () => {
    const stream = streamOf(1, 2, 3);
    const seen: number[] = [];
    for await (const chunk of stream) seen.push(chunk);

    expect(seen).toEqual([1, 2, 3]);
    expect(stream.locked).toBe(false);
  });

  // The reader must be released in the read's error steps. `for await` does not
  // call `return()` when `next()` rejects, so nothing else would ever unlock it.
  it("releases the lock when the stream errors mid-read", async () => {
    const boom = new Error("boom");
    const stream = failingStream(boom);

    await expect(
      (async () => {
        for await (const _ of stream) {
          /* drain until it throws */
        }
      })(),
    ).rejects.toThrow("boom");

    expect(stream.locked).toBe(false);
  });

  it("cancels and unlocks when the consumer breaks early", async () => {
    const stream = streamOf(1, 2, 3);
    for await (const chunk of stream) {
      expect(chunk).toBe(1);
      break;
    }
    expect(stream.locked).toBe(false);
  });

  // Native short-circuits once finished; throwing "reader owned by no readable
  // stream" would break Array.fromAsync and defensive `return()` in a finally.
  it("keeps reporting done after the stream is drained", async () => {
    const iterator = streamOf(1)[Symbol.asyncIterator]();
    await iterator.next();

    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
    await expect(iterator.return?.()).resolves.toMatchObject({ done: true });
  });

  it("leaves a real implementation alone", () => {
    if (native) Object.defineProperty(proto, KEY, native);
    const before = Object.getOwnPropertyDescriptor(proto, KEY);
    patchReadableStreamAsyncIterator();
    expect(Object.getOwnPropertyDescriptor(proto, KEY)).toEqual(before);
  });
});
