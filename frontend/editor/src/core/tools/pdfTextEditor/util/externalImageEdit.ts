// Round-trip an image through the user's own editor: save the pixels as a PNG,
// then hand the bytes back every time that file is re-saved.

export interface ExternalEditPixels {
  rgba: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ExternalEditWatch {
  readonly fileName: string;
  /** Idempotent - safe to call from an unmount path that may already have run. */
  stop(): void;
}

export type ExternalEditOutcome =
  | { status: "unsupported" }
  | { status: "cancelled" }
  | { status: "failed"; error: unknown }
  | { status: "watching"; watch: ExternalEditWatch };

export interface ExternalImageEditOptions {
  pixels: ExternalEditPixels;
  onChange: (bytes: Uint8Array) => void;
  suggestedName?: string;
  pollIntervalMs?: number;
  onError?: (error: unknown) => void;
}

interface WritableFile {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface PickedFile {
  lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface PickedFileHandle {
  name?: string;
  createWritable(): Promise<WritableFile>;
  getFile(): Promise<PickedFile>;
}

interface SavePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

interface SavePickerHost {
  showSaveFilePicker?: (
    options?: SavePickerOptions,
  ) => Promise<PickedFileHandle>;
}

const DEFAULT_POLL_MS = 1000;
const MIN_POLL_MS = 100;

function savePicker(): SavePickerHost["showSaveFilePicker"] {
  return (globalThis as unknown as SavePickerHost).showSaveFilePicker;
}

/** False on Firefox and Safari, which have no File System Access write path. */
export function isExternalImageEditSupported(): boolean {
  return typeof savePicker() === "function";
}

export async function startExternalImageEdit(
  options: ExternalImageEditOptions,
): Promise<ExternalEditOutcome> {
  const picker = savePicker();
  if (typeof picker !== "function") return { status: "unsupported" };
  const suggestedName = options.suggestedName ?? "image.png";

  let handle: PickedFileHandle | undefined;
  try {
    handle = await picker({
      suggestedName,
      types: [{ description: "PNG image", accept: { "image/png": [".png"] } }],
    });
  } catch (error) {
    if (isAbort(error)) return { status: "cancelled" };
    return { status: "failed", error };
  }
  if (!handle) return { status: "cancelled" };

  let seenAt: number;
  try {
    const png = await encodeRgbaAsPng(options.pixels);
    const writable = await handle.createWritable();
    await writable.write(png);
    await writable.close();
    seenAt = (await handle.getFile()).lastModified;
  } catch (error) {
    return { status: "failed", error };
  }

  return {
    status: "watching",
    watch: watchFile(handle, handle.name ?? suggestedName, seenAt, options),
  };
}

function watchFile(
  handle: PickedFileHandle,
  fileName: string,
  seenAt: number,
  options: ExternalImageEditOptions,
): ExternalEditWatch {
  const every = Math.max(
    MIN_POLL_MS,
    options.pollIntervalMs ?? DEFAULT_POLL_MS,
  );
  let lastSeen = seenAt;
  let stopped = false;
  let reading = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  async function poll(): Promise<void> {
    // A read slower than the interval must not stack up behind itself.
    if (stopped || reading) return;
    reading = true;
    let bytes: Uint8Array | null = null;
    try {
      const file = await handle.getFile();
      if (file.lastModified > lastSeen) {
        lastSeen = file.lastModified;
        bytes = new Uint8Array(await file.arrayBuffer());
      }
    } catch (error) {
      // A file that has gone away never comes back; stop rather than spin.
      stop();
      options.onError?.(error);
      return;
    } finally {
      reading = false;
    }
    if (bytes && !stopped) options.onChange(bytes);
  }

  timer = setInterval(() => {
    void poll();
  }, every);
  return { fileName, stop };
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
}

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** 8-bit RGBA PNG, no filtering - the file is a scratch pad for an editor. */
export async function encodeRgbaAsPng(
  pixels: ExternalEditPixels,
): Promise<Uint8Array> {
  const { width, height } = pixels;
  const rowBytes = width * 4;
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (rowBytes + 1)] = 0;
    raw.set(
      pixels.rgba.subarray(y * rowBytes, y * rowBytes + rowBytes),
      y * (rowBytes + 1) + 1,
    );
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  return concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", await zlibCompress(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

interface ByteTransform {
  readable: {
    getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> };
  };
  writable: {
    getWriter(): {
      write(chunk: Uint8Array): Promise<void>;
      close(): Promise<void>;
    };
  };
}

interface CompressionHost {
  CompressionStream?: new (format: string) => ByteTransform;
}

async function zlibCompress(raw: Uint8Array): Promise<Uint8Array> {
  const Ctor = (globalThis as unknown as CompressionHost).CompressionStream;
  if (typeof Ctor !== "function") return zlibStored(raw);
  try {
    const stream = new Ctor("deflate");
    const writer = stream.writable.getWriter();
    // Not awaited before the read loop: a chunk larger than the queue would
    // otherwise deadlock against a reader that has not started yet.
    const written = writer
      .write(raw)
      .then(() => writer.close())
      .then(
        () => true,
        () => false,
      );
    const reader = stream.readable.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) parts.push(value);
    }
    return (await written) ? concat(parts) : zlibStored(raw);
  } catch {
    return zlibStored(raw);
  }
}

/** Valid zlib stream of uncompressed blocks; the fallback when no CompressionStream. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blockMax = 0xffff;
  const blocks = Math.max(1, Math.ceil(raw.length / blockMax));
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let p = 2;
  for (let i = 0; i < blocks; i++) {
    const start = i * blockMax;
    const len = Math.min(blockMax, raw.length - start);
    out[p++] = i === blocks - 1 ? 1 : 0;
    out[p++] = len & 0xff;
    out[p++] = (len >>> 8) & 0xff;
    out[p++] = ~len & 0xff;
    out[p++] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, start + len), p);
    p += len;
  }
  const sum = adler32(raw);
  out[p++] = (sum >>> 24) & 0xff;
  out[p++] = (sum >>> 16) & 0xff;
  out[p++] = (sum >>> 8) & 0xff;
  out[p] = sum & 0xff;
  return out;
}

function pngChunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(body.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));
  return out;
}

let crcTable: Uint32Array | null = null;

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
