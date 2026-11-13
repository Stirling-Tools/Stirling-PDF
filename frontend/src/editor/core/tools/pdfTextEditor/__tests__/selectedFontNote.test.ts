import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { get, originals } = vi.hoisted(() => ({
  get: vi.fn(),
  originals: new Map<string, string>(),
}));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));
vi.mock(
  "@editor/tools/pdfTextEditor/util/documentFontCompletion",
  async (importOriginal) => {
    const real =
      await importOriginal<
        typeof import("@editor/tools/pdfTextEditor/util/documentFontCompletion")
      >();
    return {
      ...real,
      fontCompletionFor: (fontId: string) => {
        const family = originals.get(fontId);
        return family
          ? { family, source: "original" as const }
          : real.fontCompletionFor(fontId);
      },
    };
  },
);

import { selectedFontNote } from "@editor/tools/pdfTextEditor/util/selectedFontNote";
import {
  SERVER_FONTS_URL,
  loadServerFontBytes,
  forgetServerFontList,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { resetDeviceFontEmbedCache } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  resetFontCompletions,
  setClosestFont,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";

const SERIF_BOLD = "1".repeat(64);
const HEBREW_AS_TIMES = "2".repeat(64);

function bundledFont(name: string): ArrayBuffer {
  const bytes = readFileSync(
    path.resolve(
      __dirname,
      "../../../../../../../app/core/src/main/resources/static/fonts",
      name,
    ),
  );
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

const FILES: Record<string, string> = {
  [SERIF_BOLD]: "DejaVuSerif-Bold.ttf",
  [HEBREW_AS_TIMES]: "NotoSansHebrew-Regular.ttf",
};

const MANIFEST = {
  families: [
    {
      family: "DejaVu Serif",
      faces: [{ id: SERIF_BOLD, style: "Bold", bold: true, italic: false }],
    },
    {
      family: "Times New Roman",
      faces: [
        { id: HEBREW_AS_TIMES, style: "Regular", bold: false, italic: false },
      ],
    },
  ],
};

function run(id: string, fontId: string, text: string) {
  return {
    id,
    pageIndex: 0,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    text,
    fontId,
    fontSize: 12,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  };
}

function page(runs: ReturnType<typeof run>[]): PageSnapshot[] {
  return [
    {
      pageIndex: 0,
      width: 100,
      height: 100,
      revision: 0,
      dirty: false,
      runs,
      images: [],
      shapes: [],
    } as unknown as PageSnapshot,
  ];
}

describe("selectedFontNote", () => {
  beforeAll(async () => {
    forgetServerFontList();
    resetDeviceFontEmbedCache();
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL) return { data: MANIFEST };
      return {
        data: bundledFont(FILES[url.slice(SERVER_FONTS_URL.length + 1)]),
      };
    });
    expect(await loadServerFontBytes("DejaVu Serif Bold")).not.toBeNull();
    expect(await loadServerFontBytes("Times New Roman")).not.toBeNull();
  });

  it("says nothing when a device face covers the run's text", () => {
    const pages = page([run("a", "device:DejaVu Serif Bold", "Hello 42")]);

    expect(selectedFontNote(pages, ["a"])).toBeNull();
  });

  it("names the glyphs a device face lacks and its serif fallback", () => {
    const pages = page([run("a", "device:DejaVu Serif Bold", "Hello 中文")]);

    expect(selectedFontNote(pages, ["a"])).toEqual({
      kind: "gap",
      name: "DejaVu Serif Bold",
      glyphs: "中 文",
      fallback: "Times",
    });
  });

  it("judges a device face with a standard name by its own coverage", () => {
    const pages = page([run("a", "device:Times New Roman", "שלום")]);

    const note = selectedFontNote(pages, ["a"]);

    expect(note).toMatchObject({
      kind: "gap",
      name: "Times New Roman",
      fallback: "Times",
    });
    expect(note?.kind === "gap" && note.glyphs.length).toBeGreaterThan(0);
  });

  it("names the fallback when a device face's coverage is unknown", () => {
    const pages = page([run("a", "device:Acme Sans", "Hello")]);

    expect(selectedFontNote(pages, ["a"])).toEqual({
      kind: "deviceUnknown",
      name: "Acme Sans",
      fallback: "Helvetica",
    });
  });

  it("keeps standard document fonts silent and unreadable embedded ones noted", () => {
    expect(
      selectedFontNote(page([run("a", "base14:Times-Roman", "Hi")]), ["a"]),
    ).toBeNull();
    expect(
      selectedFontNote(page([run("a", "pdf:0:Acme Sans", "Hi")]), ["a"]),
    ).toEqual({ kind: "embeddedUnknown" });
  });

  it("names the font that completes an embedded one, and how sure it is", () => {
    const pages = page([run("a", "pdf:41:Acme Sans", "Hi")]);

    setClosestFont("pdf:41:Acme Sans", "Times-Roman");

    expect(selectedFontNote(pages, ["a"])).toEqual({
      kind: "completed",
      name: "Times-Roman",
      source: "closest",
    });
    resetFontCompletions();
    expect(selectedFontNote(pages, ["a"])).toEqual({ kind: "embeddedUnknown" });
  });

  it("claims the same font only when every selected font is completed by it", () => {
    const pages = page([
      { ...run("a", "pdf:42:Acme Sans", "Hi"), fontSubset: true },
      { ...run("b", "pdf:43:Acme Sans Bold", "Hi"), fontSubset: true },
    ]);
    originals.set("pdf:42:Acme Sans", "Times-Roman");
    setClosestFont("pdf:43:Acme Sans Bold", "Times-Roman");

    try {
      expect(selectedFontNote(pages, ["a", "b"])).toEqual({
        kind: "completed",
        name: "Times-Roman",
        source: "closest",
      });
    } finally {
      originals.clear();
      resetFontCompletions();
    }
  });

  it("says nothing for a selection mixing device and document fonts", () => {
    const pages = page([
      run("a", "device:Acme Sans", "Hi"),
      run("b", "pdf:0:Acme Sans", "Hi"),
    ]);

    expect(selectedFontNote(pages, ["a", "b"])).toBeNull();
  });
});
