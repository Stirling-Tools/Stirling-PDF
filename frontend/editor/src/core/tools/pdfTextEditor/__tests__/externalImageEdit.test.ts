import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deflateSync, inflateSync } from "node:zlib";
import {
  encodeRgbaAsPng,
  isExternalImageEditSupported,
  startExternalImageEdit,
} from "@app/tools/pdfTextEditor/util/externalImageEdit";

const POLL_MS = 500;

const PIXELS = {
  rgba: new Uint8Array([
    1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255,
  ]),
  width: 2,
  height: 2,
};

interface FakeFile {
  lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function fakeHandle() {
  const state = {
    written: null as Uint8Array | null,
    lastModified: 1000,
    bytes: new Uint8Array([9, 9, 9]),
    getFileCalls: 0,
    hold: false,
    release: null as null | (() => void),
    failWith: null as unknown,
  };
  const handle = {
    name: "picture.png",
    createWritable: async () => ({
      write: async (data: Uint8Array) => {
        state.written = data;
      },
      close: async () => undefined,
    }),
    getFile: async (): Promise<FakeFile> => {
      state.getFileCalls += 1;
      if (state.hold) {
        await new Promise<void>((resolve) => {
          state.release = resolve;
        });
      }
      if (state.failWith) throw state.failWith;
      const bytes = state.bytes;
      return {
        lastModified: state.lastModified,
        arrayBuffer: async () =>
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer,
      };
    },
  };
  return { state, handle };
}

function stubPicker(handle: unknown) {
  const picker = vi.fn(async (_options?: { suggestedName?: string }) => handle);
  vi.stubGlobal("showSaveFilePicker", picker);
  return picker;
}

function pngChunkBody(png: Uint8Array, type: string): Uint8Array | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  while (at + 8 <= png.length) {
    const length = view.getUint32(at);
    const name = String.fromCharCode(...png.subarray(at + 4, at + 8));
    if (name === type) return png.subarray(at + 8, at + 8 + length);
    at += 12 + length;
  }
  return null;
}

/** Expected PNG raw stream: one zero filter byte in front of every RGBA row. */
function filteredScanlines(): Uint8Array {
  return new Uint8Array([
    0, 1, 2, 3, 255, 4, 5, 6, 255, 0, 7, 8, 9, 255, 10, 11, 12, 255,
  ]);
}

class FakeCompressionStream {
  readable: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
  };
  writable: {
    getWriter(): {
      write(chunk: Uint8Array): Promise<void>;
      close(): Promise<void>;
    };
  };

  constructor(_format: string) {
    const parts: Uint8Array[] = [];
    let resolveClosed = (): void => {};
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    let sent = false;
    this.writable = {
      getWriter: () => ({
        write: async (chunk: Uint8Array) => {
          parts.push(chunk);
        },
        close: async () => {
          resolveClosed();
        },
      }),
    };
    this.readable = {
      getReader: () => ({
        read: async (): Promise<{ done: boolean; value?: Uint8Array }> => {
          await closed;
          if (sent) return { done: true };
          sent = true;
          return { done: false, value: deflateSync(Buffer.concat(parts)) };
        },
      }),
    };
  }
}

describe("encodeRgbaAsPng", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes a valid RGBA PNG using stored blocks when CompressionStream is absent", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    const png = await encodeRgbaAsPng(PIXELS);

    expect(Array.from(png.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const ihdr = pngChunkBody(png, "IHDR");
    expect(ihdr && Array.from(ihdr)).toEqual([
      0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0,
    ]);
    const idat = pngChunkBody(png, "IDAT");
    expect(idat).not.toBeNull();
    expect(
      Array.from(inflateSync(Buffer.from(idat ?? new Uint8Array()))),
    ).toEqual(Array.from(filteredScanlines()));
  });

  it("compresses through CompressionStream when the browser has one", async () => {
    vi.stubGlobal("CompressionStream", FakeCompressionStream);
    const png = await encodeRgbaAsPng(PIXELS);

    const idat = pngChunkBody(png, "IDAT");
    expect(
      Array.from(inflateSync(Buffer.from(idat ?? new Uint8Array()))),
    ).toEqual(Array.from(filteredScanlines()));
  });
});

describe("startExternalImageEdit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports unsupported instead of throwing where showSaveFilePicker is missing", async () => {
    vi.stubGlobal("showSaveFilePicker", undefined);

    expect(isExternalImageEditSupported()).toBe(false);
    await expect(
      startExternalImageEdit({ pixels: PIXELS, onChange: vi.fn() }),
    ).resolves.toEqual({ status: "unsupported" });
  });

  it("treats a cancelled picker as a normal outcome, not an error", async () => {
    const abort = Object.assign(new Error("user cancelled"), {
      name: "AbortError",
    });
    vi.stubGlobal(
      "showSaveFilePicker",
      vi.fn(() => Promise.reject(abort)),
    );

    const outcome = await startExternalImageEdit({
      pixels: PIXELS,
      onChange: vi.fn(),
    });

    expect(outcome).toEqual({ status: "cancelled" });
  });

  it("writes the pixels out as a PNG under the suggested name", async () => {
    const { state, handle } = fakeHandle();
    const picker = stubPicker(handle);

    const outcome = await startExternalImageEdit({
      pixels: PIXELS,
      suggestedName: "logo.png",
      onChange: vi.fn(),
    });

    expect(picker.mock.calls[0][0]).toMatchObject({
      suggestedName: "logo.png",
    });
    expect(Array.from(state.written?.subarray(0, 4) ?? [])).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect(outcome.status).toBe("watching");
    if (outcome.status === "watching") {
      expect(outcome.watch.fileName).toBe("picture.png");
      outcome.watch.stop();
    }
  });

  it("reports the edited bytes exactly once per external save", async () => {
    const { state, handle } = fakeHandle();
    stubPicker(handle);
    const onChange = vi.fn();
    const outcome = await startExternalImageEdit({
      pixels: PIXELS,
      pollIntervalMs: POLL_MS,
      onChange,
    });
    expect(outcome.status).toBe("watching");

    await vi.advanceTimersByTimeAsync(POLL_MS * 2);
    expect(onChange).not.toHaveBeenCalled();

    state.lastModified = 2000;
    state.bytes = new Uint8Array([1, 1]);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(Array.from(onChange.mock.calls[0][0] as Uint8Array)).toEqual([1, 1]);

    // Same mtime on later polls must not re-fire for the same edit.
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(onChange).toHaveBeenCalledTimes(1);

    state.lastModified = 3000;
    state.bytes = new Uint8Array([2, 2, 2]);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(Array.from(onChange.mock.calls[1][0] as Uint8Array)).toEqual([
      2, 2, 2,
    ]);

    if (outcome.status === "watching") outcome.watch.stop();
  });

  it("never overlaps polls when a read is slower than the interval", async () => {
    const { state, handle } = fakeHandle();
    stubPicker(handle);
    const onChange = vi.fn();
    const outcome = await startExternalImageEdit({
      pixels: PIXELS,
      pollIntervalMs: POLL_MS,
      onChange,
    });

    state.getFileCalls = 0;
    state.hold = true;
    state.lastModified = 2000;
    await vi.advanceTimersByTimeAsync(POLL_MS * 4);
    expect(state.getFileCalls).toBe(1);

    state.hold = false;
    state.release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(state.getFileCalls).toBe(2);

    if (outcome.status === "watching") outcome.watch.stop();
  });

  it("stops polling on a read error and reports it", async () => {
    const { state, handle } = fakeHandle();
    stubPicker(handle);
    const onError = vi.fn();
    await startExternalImageEdit({
      pixels: PIXELS,
      pollIntervalMs: POLL_MS,
      onChange: vi.fn(),
      onError,
    });

    state.getFileCalls = 0;
    state.failWith = new Error("file gone");
    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(state.getFileCalls).toBe(1);
  });

  it("stop() halts polling and is safe to call twice", async () => {
    const { state, handle } = fakeHandle();
    stubPicker(handle);
    const onChange = vi.fn();
    const outcome = await startExternalImageEdit({
      pixels: PIXELS,
      pollIntervalMs: POLL_MS,
      onChange,
    });
    expect(outcome.status).toBe("watching");
    if (outcome.status !== "watching") return;

    state.getFileCalls = 0;
    outcome.watch.stop();
    expect(() => outcome.watch.stop()).not.toThrow();

    state.lastModified = 5000;
    await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    expect(state.getFileCalls).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });
});
