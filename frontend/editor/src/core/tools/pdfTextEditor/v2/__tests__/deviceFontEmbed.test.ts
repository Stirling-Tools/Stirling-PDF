import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  deviceFontEmitCount,
  emitDeviceFontTextObject,
  ensureDeviceFontReady,
  isDeviceFontEmbedded,
  isDeviceFontReady,
  loadDeviceFontInto,
  resetDeviceFontEmbedCache,
} from "@app/tools/pdfTextEditor/v2/util/deviceFontEmbed";
import {
  loadLocalFontBytes,
  pickLocalFontFace,
  resetLocalFontsCache,
} from "@app/tools/pdfTextEditor/v2/util/localFonts";
import type { LocalFont } from "@app/tools/pdfTextEditor/v2/util/localFonts";
import type { FontRef } from "@app/tools/pdfTextEditor/v2/model/FontRef";
import type { EditorDocument } from "@app/tools/pdfTextEditor/v2/model/EditorDocument";
import { Page } from "@app/tools/pdfTextEditor/v2/model/Page";

type QueryStub = () => Promise<unknown[]>;

/** One FontData-shaped face; `bytes` null means `.blob()` is absent. */
function face(
  family: string,
  style: string,
  bytes: Uint8Array | null,
  blobImpl?: () => Promise<unknown>,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    family,
    style,
    fullName: `${family} ${style}`,
    postscriptName: `${family.replace(/\s+/g, "")}-${style.replace(/\s+/g, "")}`,
  };
  if (blobImpl) entry.blob = blobImpl;
  else if (bytes) {
    entry.blob = async () => ({
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    });
  }
  return entry;
}

function setQuery(stub: QueryStub | null): void {
  const w = window as unknown as { queryLocalFonts?: QueryStub };
  if (stub) w.queryLocalFonts = stub;
  else delete w.queryLocalFonts;
}

function plainFont(family: string, style: string): LocalFont {
  return {
    family,
    style,
    fullName: `${family} ${style}`,
    postscriptName: `${family.replace(/\s+/g, "")}-${style.replace(/\s+/g, "")}`,
  };
}

/** Not a real font file: parseTrueTypeCmap gives up, so coverage fails open. */
const FAKE_FONT_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

interface FakeModuleOptions {
  loadFont?: (
    doc: number,
    data: number,
    size: number,
    type: number,
    cid: boolean,
  ) => number;
  /** Right edge the emitted object measures at (drives the width check). */
  rightEdge?: number;
  omitCreateTextObj?: boolean;
}

interface FakeHarness {
  doc: EditorDocument;
  page: Page;
  calls: {
    loadFont: number;
    createTextObj: number;
    inserted: number[];
    removed: number[];
    destroyed: number[];
    freed: number[];
    malloced: number[];
  };
  ownedFonts: Map<string, FontRef>;
}

function fakeHarness(options: FakeModuleOptions = {}): FakeHarness {
  const calls = {
    loadFont: 0,
    createTextObj: 0,
    inserted: [] as number[],
    removed: [] as number[],
    destroyed: [] as number[],
    freed: [] as number[],
    malloced: [] as number[],
  };
  const heap = new Uint8Array(4096);
  let nextPtr = 16;
  const module = {
    pdfium: {
      HEAPU8: heap,
      stringToUTF16: () => undefined,
      getValue: () => options.rightEdge ?? 100,
      wasmExports: {
        malloc: (n: number) => {
          const ptr = nextPtr;
          nextPtr += Math.max(4, n);
          calls.malloced.push(ptr);
          return ptr;
        },
        free: (p: number) => {
          calls.freed.push(p);
        },
      },
    },
    FPDFText_LoadFont: (
      doc: number,
      data: number,
      size: number,
      type: number,
      cid: boolean,
    ) => {
      calls.loadFont += 1;
      return options.loadFont
        ? options.loadFont(doc, data, size, type, cid)
        : 900;
    },
    FPDFFont_Close: () => undefined,
    FPDFPageObj_CreateTextObj: () => {
      calls.createTextObj += 1;
      return 500 + calls.createTextObj;
    },
    FPDFText_SetText: () => true,
    FPDFPageObj_SetFillColor: () => true,
    FPDFPageObj_Transform: () => true,
    FPDFPage_InsertObject: (_page: number, ptr: number) => {
      calls.inserted.push(ptr);
    },
    FPDFPage_RemoveObject: (_page: number, ptr: number) => {
      calls.removed.push(ptr);
      return true;
    },
    FPDFPageObj_Destroy: (ptr: number) => {
      calls.destroyed.push(ptr);
    },
    FPDFPageObj_GetBounds: () => true,
  };
  if (options.omitCreateTextObj) {
    delete (module as { FPDFPageObj_CreateTextObj?: unknown })
      .FPDFPageObj_CreateTextObj;
  }
  const ownedFonts = new Map<string, FontRef>();
  const doc = {
    module,
    docPtr: 7,
    registerOwnedFont: (font: FontRef) => {
      ownedFonts.set(font.id, font);
    },
    ownedFont: (id: string) => ownedFonts.get(id),
  } as unknown as EditorDocument;
  const page = new Page({ index: 0, pagePtr: 3, width: 200, height: 200 });
  return { doc, page, calls, ownedFonts };
}

const FILL = { r: 0, g: 0, b: 0, a: 255 };

function emit(harness: FakeHarness, family: string, text = "Hi"): number {
  return emitDeviceFontTextObject(
    harness.doc,
    harness.page,
    family,
    text,
    12,
    FILL,
    10,
    20,
  );
}

beforeEach(() => {
  resetLocalFontsCache();
  resetDeviceFontEmbedCache();
  setQuery(null);
});

afterEach(() => {
  resetLocalFontsCache();
  resetDeviceFontEmbedCache();
  setQuery(null);
});

describe("pickLocalFontFace", () => {
  const faces = [
    plainFont("Segoe UI", "Bold"),
    plainFont("Segoe UI", "Italic"),
    plainFont("Segoe UI", "Bold Italic"),
    plainFont("Segoe UI", "Regular"),
    plainFont("Segoe UI", "Light"),
    plainFont("Arial", "Regular"),
  ];

  it("prefers the upright regular cut for a bare family name", () => {
    expect(pickLocalFontFace(faces, "Segoe UI")?.style).toBe("Regular");
  });

  it("respects bold and italic carried in the requested name", () => {
    expect(pickLocalFontFace(faces, "Segoe UI Bold")?.style).toBe("Bold");
    expect(pickLocalFontFace(faces, "Segoe UI Italic")?.style).toBe("Italic");
    expect(pickLocalFontFace(faces, "Segoe UI Bold Italic")?.style).toBe(
      "Bold Italic",
    );
  });

  it("matches case- and separator-insensitively", () => {
    expect(pickLocalFontFace(faces, "segoe-ui")?.family).toBe("Segoe UI");
  });

  it("keeps a family whose own name contains a style word", () => {
    const withBlack = [
      plainFont("Arial Black", "Regular"),
      plainFont("Arial", "Bold"),
    ];
    expect(pickLocalFontFace(withBlack, "Arial Black")?.family).toBe(
      "Arial Black",
    );
  });

  it("returns null when nothing matches", () => {
    expect(pickLocalFontFace(faces, "Comic Sans MS")).toBeNull();
    expect(pickLocalFontFace([], "Segoe UI")).toBeNull();
  });
});

describe("loadLocalFontBytes", () => {
  it("returns null when the API is unsupported", async () => {
    await expect(loadLocalFontBytes("Segoe UI")).resolves.toBeNull();
    expect(isDeviceFontReady("Segoe UI")).toBe(false);
  });

  it("returns null when the permission prompt is denied", async () => {
    const denied = new Error("denied");
    denied.name = "NotAllowedError";
    setQuery(vi.fn<QueryStub>().mockRejectedValue(denied));
    await expect(ensureDeviceFontReady("Segoe UI")).resolves.toBe(false);
  });

  it("returns null when the face exposes no blob()", async () => {
    setQuery(
      vi.fn<QueryStub>().mockResolvedValue([face("Segoe UI", "Regular", null)]),
    );
    await expect(loadLocalFontBytes("Segoe UI")).resolves.toBeNull();
  });

  it("returns null when the blob read rejects", async () => {
    setQuery(
      vi
        .fn<QueryStub>()
        .mockResolvedValue([
          face("Segoe UI", "Regular", null, () =>
            Promise.reject(new Error("blob failed")),
          ),
        ]),
    );
    await expect(loadLocalFontBytes("Segoe UI")).resolves.toBeNull();
  });

  it("returns null when the blob has no arrayBuffer()", async () => {
    setQuery(
      vi
        .fn<QueryStub>()
        .mockResolvedValue([
          face("Segoe UI", "Regular", null, async () => ({})),
        ]),
    );
    await expect(loadLocalFontBytes("Segoe UI")).resolves.toBeNull();
  });

  it("reads the bytes once per family and caches them for the session", async () => {
    const blob = vi.fn(async () => ({
      arrayBuffer: async () => FAKE_FONT_BYTES.buffer.slice(0),
    }));
    const query = vi
      .fn<QueryStub>()
      .mockResolvedValue([face("Segoe UI", "Regular", null, blob)]);
    setQuery(query);

    const [first, second] = await Promise.all([
      loadLocalFontBytes("Segoe UI"),
      loadLocalFontBytes("Segoe UI"),
    ]);
    const third = await loadLocalFontBytes("Segoe UI");

    expect(first).toBeInstanceOf(Uint8Array);
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(query).toHaveBeenCalledTimes(1);
    expect(blob).toHaveBeenCalledTimes(1);
    expect(isDeviceFontReady("segoe ui")).toBe(true);
  });

  it("does not cache a failure, so a later read can still succeed", async () => {
    setQuery(vi.fn<QueryStub>().mockResolvedValue([]));
    await expect(loadLocalFontBytes("Segoe UI")).resolves.toBeNull();

    resetLocalFontsCache();
    setQuery(
      vi
        .fn<QueryStub>()
        .mockResolvedValue([face("Segoe UI", "Regular", FAKE_FONT_BYTES)]),
    );
    await expect(loadLocalFontBytes("Segoe UI")).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });
});

describe("loadDeviceFontInto", () => {
  async function warm(family = "Segoe UI"): Promise<void> {
    setQuery(
      vi
        .fn<QueryStub>()
        .mockResolvedValue([face(family, "Regular", FAKE_FONT_BYTES)]),
    );
    await ensureDeviceFontReady(family);
  }

  it("returns 0 while the byte cache is cold", () => {
    const harness = fakeHarness();
    expect(loadDeviceFontInto(harness.doc, "Segoe UI")).toBe(0);
    expect(harness.calls.loadFont).toBe(0);
  });

  it("embeds once per document and reuses the handle", async () => {
    await warm();
    const harness = fakeHarness();

    expect(loadDeviceFontInto(harness.doc, "Segoe UI")).toBe(900);
    expect(loadDeviceFontInto(harness.doc, "Segoe UI")).toBe(900);
    expect(harness.calls.loadFont).toBe(1);
    expect(isDeviceFontEmbedded(harness.doc, "Segoe UI")).toBe(true);
  });

  it("embeds separately per document", async () => {
    await warm();
    const a = fakeHarness();
    const b = fakeHarness();

    loadDeviceFontInto(a.doc, "Segoe UI");
    loadDeviceFontInto(b.doc, "Segoe UI");

    expect(a.calls.loadFont).toBe(1);
    expect(b.calls.loadFont).toBe(1);
  });

  it("frees the buffer and never retries when PDFium refuses the font", async () => {
    await warm();
    const harness = fakeHarness({ loadFont: () => 0 });

    expect(loadDeviceFontInto(harness.doc, "Segoe UI")).toBe(0);
    expect(loadDeviceFontInto(harness.doc, "Segoe UI")).toBe(0);
    expect(harness.calls.loadFont).toBe(1);
    expect(harness.calls.freed).toEqual(harness.calls.malloced);
    expect(isDeviceFontEmbedded(harness.doc, "Segoe UI")).toBe(false);
  });

  it("frees the buffer when the binding throws", async () => {
    await warm();
    const harness = fakeHarness({
      loadFont: () => {
        throw new Error("wasm trap");
      },
    });

    expect(loadDeviceFontInto(harness.doc, "Segoe UI")).toBe(0);
    expect(harness.calls.freed).toEqual(harness.calls.malloced);
  });

  it("frees the font handle and its buffer through the owned FontRef", async () => {
    await warm();
    const harness = fakeHarness();
    loadDeviceFontInto(harness.doc, "Segoe UI");
    const buffer = harness.calls.malloced[0];
    harness.calls.freed.length = 0;

    for (const font of harness.ownedFonts.values()) font.dispose();

    expect(harness.calls.freed).toContain(buffer);
  });
});

describe("emitDeviceFontTextObject", () => {
  async function warm(family = "Segoe UI"): Promise<void> {
    setQuery(
      vi
        .fn<QueryStub>()
        .mockResolvedValue([face(family, "Regular", FAKE_FONT_BYTES)]),
    );
    await ensureDeviceFontReady(family);
  }

  it("returns 0 without touching PDFium when the bytes are not cached", () => {
    const harness = fakeHarness();
    expect(emit(harness, "Segoe UI")).toBe(0);
    expect(harness.calls.createTextObj).toBe(0);
    expect(deviceFontEmitCount(harness.doc, "Segoe UI")).toBe(0);
  });

  it("emits an inserted text object in the embedded face", async () => {
    await warm();
    const harness = fakeHarness();

    const ptr = emit(harness, "Segoe UI");

    expect(ptr).toBeGreaterThan(0);
    expect(harness.calls.inserted).toEqual([ptr]);
    expect(harness.calls.removed).toEqual([]);
    expect(deviceFontEmitCount(harness.doc, "Segoe UI")).toBe(1);
  });

  it("rejects an emit that rendered no width and cleans it up", async () => {
    await warm();
    // Right edge equal to x: the face produced .notdef, not glyphs.
    const harness = fakeHarness({ rightEdge: 10 });

    const ptr = emit(harness, "Segoe UI");

    expect(ptr).toBe(0);
    expect(harness.calls.removed).toHaveLength(1);
    expect(harness.calls.destroyed).toEqual(harness.calls.removed);
    expect(deviceFontEmitCount(harness.doc, "Segoe UI")).toBe(0);
  });

  it("returns 0 when the CreateTextObj binding is missing", async () => {
    await warm();
    const harness = fakeHarness({ omitCreateTextObj: true });
    expect(emit(harness, "Segoe UI")).toBe(0);
  });

  it("returns 0 for an unknown family and for empty text", async () => {
    await warm();
    const harness = fakeHarness();
    expect(emit(harness, "Comic Sans MS")).toBe(0);
    expect(emit(harness, "Segoe UI", "")).toBe(0);
  });
});
