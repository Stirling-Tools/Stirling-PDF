import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  embeddedFaceFamily,
  isEmbeddedFaceReady,
  onEmbeddedFaceLoaded,
  registerEmbeddedFace,
  resetEmbeddedFaces,
} from "@app/tools/pdfTextEditor/v2/util/embeddedFace";

type PdfiumModule = Parameters<typeof registerEmbeddedFace>[0];

const MAX_FACE_BYTES = 8 * 1024 * 1024;

interface FaceRecord {
  family: string;
  size: number;
  resolve: () => void;
  reject: () => void;
}

let created: FaceRecord[] = [];
let constructorThrows = false;
let addedFamilies: string[] = [];
let fontsAdd: ReturnType<typeof vi.fn>;
let fontsDelete: ReturnType<typeof vi.fn>;

class FakeFontFace {
  family: string;
  rec: FaceRecord;
  constructor(family: string, source: BufferSource) {
    if (constructorThrows) throw new TypeError("malformed buffer");
    this.family = family;
    this.rec = {
      family,
      size: (source as Uint8Array).byteLength,
      resolve: () => {},
      reject: () => {},
    };
    created.push(this.rec);
  }
  load(): Promise<FakeFontFace> {
    return new Promise<FakeFontFace>((res, rej) => {
      this.rec.resolve = () => res(this);
      this.rec.reject = () => rej(new Error("unsupported format"));
    });
  }
}

function faceFor(family: string): FaceRecord | undefined {
  return created.find((f) => f.family === family);
}

function makeModule(
  data: Map<number, Uint8Array>,
  heapBytes = 9 * 1024 * 1024,
): PdfiumModule {
  const memory = { buffer: new ArrayBuffer(heapBytes) };
  let next = 8; // pointer 0 means "absent" to the code under test
  let live = 0;
  const view = () => new DataView(memory.buffer);
  const fake = {
    pdfium: {
      wasmExports: {
        memory,
        malloc(n: number): number {
          const ptr = next;
          next += (n + 7) & ~7;
          if (next > heapBytes) throw new Error("fake heap exhausted");
          live++;
          return ptr;
        },
        free(): void {
          if (--live === 0) next = 8;
        },
      },
      getValue(ptr: number): number {
        return view().getInt32(ptr, true);
      },
    },
    FPDFFont_GetFontData(
      font: number,
      buf: number,
      len: number,
      out: number,
    ): boolean {
      const bytes = data.get(font);
      if (!bytes) return false;
      if (buf && len >= bytes.length) {
        new Uint8Array(memory.buffer).set(bytes, buf);
      }
      view().setInt32(out, bytes.length, true);
      return true;
    },
  };
  return fake as unknown as PdfiumModule;
}

function fontBytes(sig: string | number[], size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  const head =
    typeof sig === "string" ? [...sig].map((c) => c.charCodeAt(0)) : sig;
  bytes.set(head.slice(0, size), 0);
  return bytes;
}

const TRUETYPE = [0x00, 0x01, 0x00, 0x00];

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

beforeEach(() => {
  created = [];
  addedFamilies = [];
  constructorThrows = false;
  fontsAdd = vi.fn((face: FakeFontFace) => addedFamilies.push(face.family));
  fontsDelete = vi.fn();
  Object.defineProperty(document, "fonts", {
    value: { add: fontsAdd, delete: fontsDelete },
    configurable: true,
    writable: true,
  });
  (globalThis as { FontFace?: unknown }).FontFace = FakeFontFace;
  resetEmbeddedFaces();
});

afterEach(() => {
  resetEmbeddedFaces();
  delete (globalThis as { FontFace?: unknown }).FontFace;
  Reflect.deleteProperty(document, "fonts");
});

describe("registerEmbeddedFace format sniff", () => {
  it("accepts every signature a browser can load", () => {
    const data = new Map<number, Uint8Array>([
      [11, fontBytes(TRUETYPE)],
      [12, fontBytes("true")],
      [13, fontBytes("OTTO")],
      [14, fontBytes("wOFF")],
      [15, fontBytes("wOF2")],
    ]);
    const m = makeModule(data);
    for (const ptr of data.keys()) registerEmbeddedFace(m, ptr);
    expect(created.map((f) => f.family)).toEqual([
      embeddedFaceFamily(11),
      embeddedFaceFamily(12),
      embeddedFaceFamily(13),
      embeddedFaceFamily(14),
      embeddedFaceFamily(15),
    ]);
  });

  it("skips formats FontFace refuses, before building a face", () => {
    const data = new Map<number, Uint8Array>([
      [21, fontBytes("ttcf")], // TrueType collection
      [22, fontBytes([0x01, 0x00, 0x04, 0x04])], // bare CFF
      [23, fontBytes("%!PS")], // Type1
      [24, fontBytes(TRUETYPE, 3)], // too short to sniff
    ]);
    const m = makeModule(data);
    for (const ptr of data.keys()) registerEmbeddedFace(m, ptr);
    expect(created).toHaveLength(0);
  });

  it("ignores a null pointer and a font PDFium has no data for", () => {
    const m = makeModule(new Map([[31, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 0);
    registerEmbeddedFace(m, 32);
    expect(created).toHaveLength(0);
  });

  it("tries a pointer once per document", () => {
    const m = makeModule(new Map([[41, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 41);
    registerEmbeddedFace(m, 41);
    expect(created).toHaveLength(1);
  });

  it("does nothing when FontFace is unavailable", () => {
    delete (globalThis as { FontFace?: unknown }).FontFace;
    const m = makeModule(new Map([[51, fontBytes(TRUETYPE)]]));
    expect(() => registerEmbeddedFace(m, 51)).not.toThrow();
    expect(created).toHaveLength(0);
  });
});

describe("embedded face byte budget", () => {
  const big = fontBytes(TRUETYPE, MAX_FACE_BYTES);

  function moduleOf(ptrs: number[], bytes: Uint8Array): PdfiumModule {
    return makeModule(new Map(ptrs.map((p) => [p, bytes])));
  }

  it("rejects a face whose reported size is beyond the per-face cap", () => {
    const over = fontBytes(TRUETYPE, MAX_FACE_BYTES + 1);
    registerEmbeddedFace(moduleOf([61], over), 61);
    expect(created).toHaveLength(0);
  });

  it("frees the budget of a load that rejects", async () => {
    const ptrs = [71, 72, 73, 74, 75, 76];
    const m = moduleOf([...ptrs, 77], big);
    for (const ptr of ptrs) registerEmbeddedFace(m, ptr);
    expect(created).toHaveLength(6);
    for (const rec of created) rec.reject();
    await flush();

    registerEmbeddedFace(m, 77);
    expect(created).toHaveLength(7);
    faceFor(embeddedFaceFamily(77))?.resolve();
    await flush();
    expect(isEmbeddedFaceReady(77)).toBe(true);
  });

  it("frees the budget when the FontFace constructor throws", () => {
    constructorThrows = true;
    const ptrs = [81, 82, 83, 84, 85, 86];
    const m = moduleOf([...ptrs, 87], big);
    for (const ptr of ptrs) registerEmbeddedFace(m, ptr);
    expect(created).toHaveLength(0);

    constructorThrows = false;
    registerEmbeddedFace(m, 87);
    expect(created).toHaveLength(1);
  });

  it("still skips a face once the budget is genuinely held", () => {
    const ptrs = [91, 92, 93, 94, 95, 96];
    const m = moduleOf([...ptrs, 97], big);
    for (const ptr of ptrs) registerEmbeddedFace(m, ptr);
    registerEmbeddedFace(m, 97);
    expect(created).toHaveLength(6);
  });

  it("frees the whole budget on reset", () => {
    const ptrs = [101, 102, 103, 104, 105, 106];
    const m = moduleOf([...ptrs, 107], big);
    for (const ptr of ptrs) registerEmbeddedFace(m, ptr);
    resetEmbeddedFaces();
    registerEmbeddedFace(m, 107);
    expect(created).toHaveLength(7);
  });
});

describe("resetEmbeddedFaces vs an in-flight load", () => {
  it("drops a face that resolves after its document is gone", async () => {
    const m = makeModule(new Map([[111, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 111);
    const pending = faceFor(embeddedFaceFamily(111));

    resetEmbeddedFaces();
    pending?.resolve();
    await flush();

    expect(fontsAdd).not.toHaveBeenCalled();
    expect(isEmbeddedFaceReady(111)).toBe(false);
  });

  it("removes the faces it added and clears readiness", async () => {
    const m = makeModule(new Map([[121, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 121);
    faceFor(embeddedFaceFamily(121))?.resolve();
    await flush();
    expect(isEmbeddedFaceReady(121)).toBe(true);

    resetEmbeddedFaces();
    expect(fontsDelete).toHaveBeenCalledTimes(1);
    expect(isEmbeddedFaceReady(121)).toBe(false);
  });

  it("re-registers a reused pointer for the new document", async () => {
    const m = makeModule(new Map([[131, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 131);
    resetEmbeddedFaces();

    registerEmbeddedFace(m, 131);
    expect(created).toHaveLength(2);
    created[1].resolve();
    await flush();
    expect(isEmbeddedFaceReady(131)).toBe(true);
    expect(addedFamilies).toEqual([embeddedFaceFamily(131)]);
  });
});

describe("embedded face load signal", () => {
  it("reports readiness only once the face is in document.fonts", async () => {
    const m = makeModule(new Map([[141, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 141);
    expect(isEmbeddedFaceReady(141)).toBe(false);

    faceFor(embeddedFaceFamily(141))?.resolve();
    await flush();
    expect(isEmbeddedFaceReady(141)).toBe(true);
    expect(fontsAdd).toHaveBeenCalledTimes(1);
  });

  it("stays unready when the load rejects", async () => {
    const m = makeModule(new Map([[151, fontBytes(TRUETYPE)]]));
    const listener = vi.fn();
    onEmbeddedFaceLoaded(listener);
    registerEmbeddedFace(m, 151);
    faceFor(embeddedFaceFamily(151))?.reject();
    await flush();
    expect(isEmbeddedFaceReady(151)).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies subscribers once per successful load", async () => {
    const listener = vi.fn();
    onEmbeddedFaceLoaded(listener);
    const m = makeModule(
      new Map([
        [161, fontBytes(TRUETYPE)],
        [162, fontBytes("OTTO")],
      ]),
    );
    registerEmbeddedFace(m, 161);
    registerEmbeddedFace(m, 162);
    expect(listener).not.toHaveBeenCalled();

    faceFor(embeddedFaceFamily(161))?.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    faceFor(embeddedFaceFamily(162))?.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribe", async () => {
    const listener = vi.fn();
    const off = onEmbeddedFaceLoaded(listener);
    off();
    const m = makeModule(new Map([[171, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 171);
    faceFor(embeddedFaceFamily(171))?.resolve();
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps notifying a throwing subscriber's neighbours", async () => {
    const bad = vi.fn(() => {
      throw new Error("subscriber blew up");
    });
    const good = vi.fn();
    onEmbeddedFaceLoaded(bad);
    onEmbeddedFaceLoaded(good);
    const m = makeModule(new Map([[181, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 181);
    faceFor(embeddedFaceFamily(181))?.resolve();
    await flush();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("keeps subscriptions across a document swap", async () => {
    const listener = vi.fn();
    onEmbeddedFaceLoaded(listener);
    resetEmbeddedFaces();

    const m = makeModule(new Map([[191, fontBytes(TRUETYPE)]]));
    registerEmbeddedFace(m, 191);
    faceFor(embeddedFaceFamily(191))?.resolve();
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
