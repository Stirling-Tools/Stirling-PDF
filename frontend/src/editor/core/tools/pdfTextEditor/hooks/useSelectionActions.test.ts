import { readFileSync } from "node:fs";
import path from "node:path";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get, losesText, lacksLetters, notRestored, loadScriptScanFaces } =
  vi.hoisted(() => ({
    get: vi.fn(),
    losesText: new Set<string>(),
    lacksLetters: new Set<string>(),
    notRestored: new Set<string>(),
    loadScriptScanFaces: vi.fn(async (_scripts: readonly string[]) => {}),
  }));
vi.mock(
  "@editor/tools/pdfTextEditor/util/scanFontLibrary",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadScriptScanFaces,
  }),
);
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));
vi.mock("@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand", () => ({
  SetFontFamilyCommand: class {
    constructor(readonly opts: { runId: string; nextFamily: string }) {}

    wouldLoseText(): boolean {
      return losesText.has(this.opts.runId);
    }

    coverage(): "all" | "some" {
      return lacksLetters.has(this.opts.runId) ? "some" : "all";
    }

    refusal(): "losesText" | "notRestored" | null {
      if (this.wouldLoseText()) return "losesText";
      return notRestored.has(this.opts.runId) ? "notRestored" : null;
    }
  },
}));
vi.mock(
  "@editor/tools/pdfTextEditor/commands/scanTextEdit",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    prefitScanRun: vi.fn(() => true),
    scanRunNeedsFit: vi.fn(() => false),
  }),
);
vi.mock("@editor/tools/pdfTextEditor/commands/CompositeCommand", () => ({
  CompositeCommand: class {
    constructor(readonly commands: unknown[]) {}
  },
}));

import { useSelectionActions } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  SERVER_FONTS_URL,
  loadServerFonts,
  forgetServerFontList,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import {
  listLocalFonts,
  resetLocalFontsCache,
} from "@editor/tools/pdfTextEditor/util/localFonts";
import { resetDeviceFontEmbedCache } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  noteDocumentFontStyle,
  resetDocumentFontStyles,
} from "@editor/tools/pdfTextEditor/util/documentFontStyle";
import { _clearFontNameCacheForTests } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import type { WrappedPdfiumModule } from "@embedpdf/pdfium";
import {
  prefitScanRun,
  scanRunNeedsFit,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";

const REGULAR = "1".repeat(64);
const ITALIC = "2".repeat(64);
const HEBREW = "5".repeat(64);

const FONTS = path.resolve(
  __dirname,
  "../../../../../../../app/core/src/main/resources/static/fonts",
);
const HEBREW_TTF = readFileSync(path.join(FONTS, "NotoSansHebrew-Regular.ttf"));
const LATIN_TTF = readFileSync(path.join(FONTS, "LiberationSans-Regular.ttf"));

function bytesOf(font: Buffer): { data: ArrayBuffer } {
  return {
    data: font.buffer.slice(
      font.byteOffset,
      font.byteOffset + font.byteLength,
    ) as ArrayBuffer,
  };
}

function face(id: string, style: string, italic: boolean) {
  return { id, style, bold: false, italic, weight: 400, postscriptName: "" };
}

const MANIFEST = {
  families: [
    {
      family: "Acme Sans",
      faces: [face(REGULAR, "Regular", false), face(ITALIC, "Italic", true)],
    },
    { family: "Noto Sans Hebrew", faces: [face(HEBREW, "Regular", false)] },
  ],
};

interface FakeRun {
  id: string;
  pageIndex: number;
  fontId: string;
  text: string;
  locked: boolean;
  textReadOnly?: boolean;
  fill: { r: number; g: number; b: number; a: number };
}

function run(id: string, fontId: string, text = "Hello"): FakeRun {
  return {
    id,
    pageIndex: 0,
    fontId,
    text,
    locked: false,
    fill: { r: 0, g: 0, b: 0, a: 255 },
  };
}

const FONT_HANDLE = 7;

function fakeStore(
  runs: FakeRun[],
  selected: string[],
  pdfiumLoadsFont = true,
) {
  const openDocument = () => {
    const owned = new Map<string, { id: string }>();
    return {
      loadedPages: () => [{ runs }],
      docPtr: 1,
      ownedFont: (id: string) => owned.get(id),
      findOwnedFont: (matches: (font: { id: string }) => boolean) =>
        [...owned.values()].find(matches),
      registerOwnedFont: (font: { id: string }) => owned.set(font.id, font),
      recordEmbeddedFontFile: () => {},
      module: {
        FPDFText_LoadFont: () => (pdfiumLoadsFont ? FONT_HANDLE : 0),
        pdfium: {
          HEAPU8: new Uint8Array(1 << 20),
          wasmExports: { malloc: () => 8, free: () => {} },
        },
      },
    };
  };
  let doc = openDocument();
  const selection = { value: { runIds: selected } };
  const dispatch = vi.fn();
  const setError = vi.fn();
  const store = {
    selection,
    dispatch,
    setError,
    get document() {
      return doc;
    },
  } as unknown as EditorStore;
  return {
    store,
    dispatch,
    setError,
    select: (ids: string[]) => {
      selection.value = { runIds: ids };
    },
    openAnotherDocument: () => {
      doc = openDocument();
    },
  };
}

interface Recorded {
  opts?: { runId: string; nextFamily: string };
  commands?: Recorded[];
}

function dispatchedChanges(dispatch: ReturnType<typeof vi.fn>): string[] {
  const flatten = (cmd: Recorded): Recorded[] =>
    cmd.commands ? cmd.commands.flatMap(flatten) : [cmd];
  return dispatch.mock.calls
    .flatMap(([cmd]) => flatten(cmd as Recorded))
    .map((cmd) => `${cmd.opts?.runId}:${cmd.opts?.nextFamily}`);
}

function serveFaces(serve: (id: string) => Promise<{ data: ArrayBuffer }>) {
  get.mockImplementation(async (url: string) => {
    if (url === SERVER_FONTS_URL) return { data: MANIFEST };
    return serve(url.slice(SERVER_FONTS_URL.length + 1));
  });
}

/** Serve every face from a download that stays pending until the returned call. */
function holdDownloads(): (value: { data: ArrayBuffer }) => void {
  let finish: (value: { data: ArrayBuffer }) => void = () => {};
  serveFaces(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return (value) => finish(value);
}

function fontBytes(): { data: ArrayBuffer } {
  return { data: new Uint8Array([0, 1, 0, 0]).buffer };
}

function actionsFor(store: EditorStore) {
  return renderHook(() => useSelectionActions(store)).result.current;
}

const ITALIC_FLAG = 64;

/** A document font as PDFium describes it: its /BaseFont name and descriptor flags. */
function documentFont(handle: number, baseFont: string, flags: number): void {
  noteDocumentFontStyle(
    {
      FPDFFont_GetBaseFontName: (_font: number, buf: number) =>
        buf ? 0 : baseFont.length + 1,
      FPDFFont_GetFlags: () => flags,
      pdfium: {
        UTF8ToString: () => baseFont,
        wasmExports: { malloc: () => 8, free: () => {} },
      },
    } as unknown as WrappedPdfiumModule,
    handle,
  );
}

describe("useSelectionActions font changes", () => {
  beforeEach(() => {
    get.mockReset();
    forgetServerFontList();
    resetLocalFontsCache();
    resetDeviceFontEmbedCache();
    resetDocumentFontStyles();
    _clearFontNameCacheForTests();
    losesText.clear();
    lacksLetters.clear();
    notRestored.clear();
    loadScriptScanFaces.mockClear();
  });

  afterEach(() => {
    delete (window as unknown as { queryLocalFonts?: unknown }).queryLocalFonts;
  });

  it("applies a built-in font without asking for device fonts", async () => {
    const queryLocalFonts = vi.fn(async () => []);
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts =
      queryLocalFonts;
    const { store, dispatch } = fakeStore(
      [run("a", "base14:Helvetica")],
      ["a"],
    );

    expect(await actionsFor(store).changeFontFamily("Times-Roman")).toBeNull();

    expect(queryLocalFonts).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(dispatchedChanges(dispatch)).toEqual(["a:Times-Roman"]);
  });

  it("keeps bold italic text bold italic in the built-in family picked", async () => {
    const { store, dispatch } = fakeStore(
      [run("a", "pdf:7:TrebuchetMS-BoldItalic"), run("b", "base14:Helvetica")],
      ["a", "b"],
    );

    expect(await actionsFor(store).changeFontFamily("Times-Roman")).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual([
      "a:Times-BoldItalic",
      "b:Times-Roman",
    ]);
  });

  it("applies a face named outright as it is", async () => {
    const { store, dispatch } = fakeStore(
      [run("a", "pdf:7:TrebuchetMS-BoldItalic")],
      ["a"],
    );

    expect(await actionsFor(store).changeFontFamily("Times-Italic")).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual(["a:Times-Italic"]);
  });

  it("keeps an italic run italic in a server family with an italic face", async () => {
    serveFaces(async () => fontBytes());
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "pdf:7:TrebuchetMS-Italic"), run("b", "base14:Helvetica")],
      ["a", "b"],
    );

    expect(await actionsFor(store).changeFontFamily("Acme Sans")).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual([
      "a:Acme Sans Italic",
      "b:Acme Sans",
    ]);
  });

  it("keeps a run italic when only the PDF's own font name says so", async () => {
    serveFaces(async () => fontBytes());
    await loadServerFonts();
    documentFont(7, "DAAAAA+Georgia-Italic", 0);
    documentFont(8, "BAAAAA+Georgia", 0);
    const { store, dispatch } = fakeStore(
      [run("a", "pdf:7:Georgia"), run("b", "pdf:8:Georgia")],
      ["a", "b"],
    );

    expect(await actionsFor(store).changeFontFamily("Acme Sans")).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual([
      "a:Acme Sans Italic",
      "b:Acme Sans",
    ]);
  });

  it("keeps a run italic when only its font descriptor says so", async () => {
    serveFaces(async () => fontBytes());
    await loadServerFonts();
    documentFont(7, "ABCDEF+MinionPro-It", ITALIC_FLAG);
    const noDescriptor = -1;
    documentFont(8, "ABCDEF+MinionPro", noDescriptor);
    const { store, dispatch } = fakeStore(
      [run("a", "pdf:7:Minion Pro"), run("b", "pdf:8:Minion Pro")],
      ["a", "b"],
    );

    expect(await actionsFor(store).changeFontFamily("Acme Sans")).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual([
      "a:Acme Sans Italic",
      "b:Acme Sans",
    ]);
  });

  it("leaves bold to the bold entries in the list", async () => {
    serveFaces(async () => fontBytes());
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "pdf:7:TrebuchetMS-Bold")],
      ["a"],
    );

    expect(await actionsFor(store).changeFontFamily("Acme Sans")).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual(["a:Acme Sans"]);
  });

  it("leaves a run locked while its font change was waiting", async () => {
    const runs = [run("a", "base14:Helvetica")];
    const { store, dispatch } = fakeStore(runs, ["a"]);

    const change = actionsFor(store).changeFontFamily("Times-Roman");
    runs[0].locked = true;
    expect(await change).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual([]);
  });

  it("leaves the text alone when a server font cannot be downloaded", async () => {
    serveFaces(async () => {
      throw new Error("gone");
    });
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "base14:Helvetica")],
      ["a"],
    );

    expect(await actionsFor(store).changeFontFamily("Acme Sans")).toBe(
      "serverFontFailed",
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("leaves the text alone when the font will not embed", async () => {
    serveFaces(async () => fontBytes());
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "base14:Helvetica")],
      ["a"],
      false,
    );

    expect(await actionsFor(store).changeFontFamily("Acme Sans")).toBe(
      "embedFailed",
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("changes the runs that were selected when the font was picked", async () => {
    const finishDownload = holdDownloads();
    await loadServerFonts();
    const { store, dispatch, select } = fakeStore(
      [run("a", "base14:Helvetica"), run("b", "base14:Helvetica")],
      ["a"],
    );

    const picked = actionsFor(store).changeFontFamily("Acme Sans");
    select(["b"]);
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    finishDownload(fontBytes());

    expect(await picked).toBeNull();
    expect(dispatchedChanges(dispatch)).toEqual(["a:Acme Sans"]);
  });

  it("drops a font change when another document opened during the download", async () => {
    const finishDownload = holdDownloads();
    await loadServerFonts();
    const { store, dispatch, openAnotherDocument } = fakeStore(
      [run("a", "base14:Helvetica")],
      ["a"],
    );

    const closed = vi.spyOn(store.document!.module, "FPDFText_LoadFont");

    const picked = actionsFor(store).changeFontFamily("Acme Sans");
    openAnotherDocument();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    finishDownload(fontBytes());

    expect(await picked).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
  });

  it("skips runs removed during the download and records nothing when none remain", async () => {
    const finishDownload = holdDownloads();
    await loadServerFonts();
    const runs = [run("a", "base14:Helvetica"), run("b", "base14:Helvetica")];
    const { store, dispatch } = fakeStore(runs, ["a", "b"]);

    const picked = actionsFor(store).changeFontFamily("Acme Sans");
    runs.splice(1, 1);
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    finishDownload(fontBytes());

    expect(await picked).toBeNull();
    expect(dispatchedChanges(dispatch)).toEqual(["a:Acme Sans"]);

    dispatch.mockClear();
    runs.push(run("c", "base14:Helvetica"));
    const { store: other, dispatch: otherDispatch } = fakeStore(runs, ["c"]);
    const removedAll = actionsFor(other).changeFontFamily("Acme Sans Italic");
    runs.splice(0, runs.length, run("c2", "base14:Helvetica"));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    finishDownload(fontBytes());

    expect(await removedAll).toBeNull();
    expect(otherDispatch).not.toHaveBeenCalled();
  });

  it("keeps a run's font when its italic face cannot be downloaded", async () => {
    serveFaces(async (id) => {
      if (id === ITALIC) throw new Error("gone");
      return fontBytes();
    });
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "device:Acme Sans")],
      ["a"],
    );

    await actionsFor(store).toggleItalic();

    expect(get).toHaveBeenCalledWith(
      `${SERVER_FONTS_URL}/${ITALIC}`,
      expect.anything(),
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps a run's font when its device italic face cannot be embedded", async () => {
    const cff = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0]);
    const deviceFace = (style: string) => ({
      family: "Acme Serif",
      style,
      postscriptName: `AcmeSerif-${style}`,
      blob: async () => new Blob([cff]),
    });
    (window as unknown as { queryLocalFonts: unknown }).queryLocalFonts =
      async () => [deviceFace("Regular"), deviceFace("Italic")];
    await listLocalFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "device:Acme Serif")],
      ["a"],
    );

    await actionsFor(store).toggleItalic();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("leaves a run locked during the download unchanged", async () => {
    const finishDownload = holdDownloads();
    await loadServerFonts();
    const runs = [run("a", "base14:Helvetica"), run("b", "base14:Helvetica")];
    const { store, dispatch } = fakeStore(runs, ["a", "b"]);

    const picked = actionsFor(store).changeFontFamily("Acme Sans");
    runs[1].locked = true;
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    finishDownload(fontBytes());

    expect(await picked).toBeNull();
    expect(dispatchedChanges(dispatch)).toEqual(["a:Acme Sans"]);
  });

  it("keeps a run's font when its italic face will not embed", async () => {
    serveFaces(async () => fontBytes());
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "device:Acme Sans")],
      ["a"],
      false,
    );

    await actionsFor(store).toggleItalic();

    expect(get).toHaveBeenCalledWith(
      `${SERVER_FONTS_URL}/${ITALIC}`,
      expect.anything(),
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("refuses a font that has none of the selected characters", async () => {
    serveFaces(async () => bytesOf(HEBREW_TTF));
    await loadServerFonts();
    const english = fakeStore([run("a", "base14:Helvetica", "Hello")], ["a"]);
    const mixed = fakeStore(
      [run("b", "base14:Helvetica", "Hello שלום")],
      ["b"],
    );
    lacksLetters.add("b");

    expect(
      await actionsFor(english.store).changeFontFamily("Noto Sans Hebrew"),
    ).toBe("noGlyphs");
    expect(english.dispatch).not.toHaveBeenCalled();

    expect(
      await actionsFor(mixed.store).changeFontFamily("Noto Sans Hebrew"),
    ).toBe("closestMatch");
    expect(dispatchedChanges(mixed.dispatch)).toEqual(["b:Noto Sans Hebrew"]);
  });

  it("leaves text that needs shaping in its own font", async () => {
    const hindi = fakeStore([run("a", "pdf:7:Mangal", "नमस्ते")], ["a"]);
    const mixed = fakeStore(
      [run("b", "pdf:7:Mangal", "नमस्ते"), run("c", "pdf:7:Arial", "Hello")],
      ["b", "c"],
    );

    expect(await actionsFor(hindi.store).changeFontFamily("Times-Roman")).toBe(
      "needsShaping",
    );
    expect(hindi.dispatch).not.toHaveBeenCalled();
    expect(await actionsFor(mixed.store).changeFontFamily("Times-Roman")).toBe(
      "needsShaping",
    );
    expect(dispatchedChanges(mixed.dispatch)).toEqual(["c:Times-Roman"]);
  });

  it("refuses a font that has only the digits and punctuation of a line", async () => {
    serveFaces(async () => bytesOf(LATIN_TTF));
    await loadServerFonts();
    const heading = fakeStore(
      [run("a", "pdf:7:DejaVu Serif", "Հոդված 1, 2.")],
      ["a"],
    );
    const numbers = fakeStore([run("b", "pdf:7:DejaVu Serif", "1, 2.")], ["b"]);

    expect(await actionsFor(heading.store).changeFontFamily("Acme Sans")).toBe(
      "noGlyphs",
    );
    expect(heading.dispatch).not.toHaveBeenCalled();
    expect(
      await actionsFor(numbers.store).changeFontFamily("Acme Sans"),
    ).toBeNull();
    expect(dispatchedChanges(numbers.dispatch)).toEqual(["b:Acme Sans"]);
  });

  it("leaves a run upright when the italic cut has none of its letters", async () => {
    serveFaces(async (id) =>
      id === ITALIC ? bytesOf(HEBREW_TTF) : bytesOf(LATIN_TTF),
    );
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [
        run("a", "device:Acme Sans", "Hello"),
        run("b", "device:Acme Sans", "שלום"),
      ],
      ["a", "b"],
    );

    await actionsFor(store).toggleItalic();

    expect(dispatchedChanges(dispatch)).toEqual(["b:Acme Sans Italic"]);
  });

  it("refuses a built-in font that has none of a line's letters", async () => {
    const korean = fakeStore(
      [run("a", "pdf:7:Noto Sans KR", "모든 인류 구성원의 자유,")],
      ["a"],
    );
    const symbols = fakeStore([run("b", "pdf:7:Symbols", "✓ → ≥")], ["b"]);
    const numbers = fakeStore(
      [run("c", "pdf:7:Noto Sans KR", "1,250.00")],
      ["c"],
    );

    expect(await actionsFor(korean.store).changeFontFamily("Times-Bold")).toBe(
      "noGlyphs",
    );
    expect(korean.dispatch).not.toHaveBeenCalled();
    expect(await actionsFor(symbols.store).changeFontFamily("Helvetica")).toBe(
      "noGlyphs",
    );
    expect(symbols.dispatch).not.toHaveBeenCalled();
    expect(
      await actionsFor(numbers.store).changeFontFamily("Helvetica"),
    ).toBeNull();
    expect(dispatchedChanges(numbers.dispatch)).toEqual(["c:Helvetica"]);
  });

  it("leaves a run the font has no letters for as it is and changes the rest", async () => {
    const { store, dispatch } = fakeStore(
      [
        run("a", "pdf:7:Noto Sans", "Article 1"),
        run("b", "pdf:8:Noto Sans KR", "모든 인류"),
      ],
      ["a", "b"],
    );

    expect(await actionsFor(store).changeFontFamily("Helvetica")).toBe(
      "someLeftUnchanged",
    );
    expect(dispatchedChanges(dispatch)).toEqual(["a:Helvetica"]);
  });

  it("leaves a line the editor cannot redraw as it is, says so, and changes the rest", async () => {
    const mixed = {
      ...run("b", "pdf:8:Noto Sans", "ISO 50001"),
      textReadOnly: true,
    };
    const { store, dispatch, setError } = fakeStore(
      [run("a", "pdf:7:Noto Sans", "Article 1"), mixed],
      ["a", "b"],
    );
    const actions = actionsFor(store);

    expect(await actions.changeFontFamily("Helvetica")).toBeNull();
    expect(dispatchedChanges(dispatch)).toEqual(["a:Helvetica"]);
    expect(setError).toHaveBeenCalledTimes(1);

    actions.changeFill("#ff0000");
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2));
    expect((dispatch.mock.calls[1][0] as Recorded).commands).toHaveLength(2);
    expect(setError).toHaveBeenCalledTimes(1);
  });

  it("says why when the document font cannot draw the text it is put back on", async () => {
    notRestored.add("a");
    const { store, dispatch } = fakeStore(
      [run("a", "base14:Helvetica", "Time (s)")],
      ["a"],
    );

    expect(await actionsFor(store).changeFontFamily("pdf:7:DejaVuSans")).toBe(
      "documentFontCannotDraw",
    );
    expect(dispatchedChanges(dispatch)).toEqual([]);
  });

  it("gives a run the plain family when the italic cut has none of its letters", async () => {
    get.mockImplementation(async (url: string) => {
      if (url === SERVER_FONTS_URL)
        return {
          data: {
            families: [
              {
                family: "Mixed Sans",
                faces: [
                  face(REGULAR, "Regular", false),
                  face(HEBREW, "Italic", true),
                ],
              },
            ],
          },
        };
      return url.endsWith(HEBREW) ? bytesOf(HEBREW_TTF) : fontBytes();
    });
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [
        run("a", "pdf:7:Georgia-Italic", "Hello"),
        run("b", "pdf:7:Georgia-Italic", "שלום"),
      ],
      ["a", "b"],
    );

    expect(await actionsFor(store).changeFontFamily("Mixed Sans")).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual([
      "a:Mixed Sans",
      "b:Mixed Sans Italic",
    ]);
  });

  it("leaves a run that would lose letters as it is", async () => {
    losesText.add("b");
    const both = fakeStore(
      [run("a", "pdf:7:Noto Sans"), run("b", "pdf:7:Noto Sans")],
      ["a", "b"],
    );
    const alone = fakeStore([run("b", "pdf:7:Noto Sans")], ["b"]);

    expect(await actionsFor(both.store).changeFontFamily("Helvetica")).toBe(
      "someLeftUnchanged",
    );
    expect(dispatchedChanges(both.dispatch)).toEqual(["a:Helvetica"]);

    expect(await actionsFor(alone.store).changeFontFamily("Helvetica")).toBe(
      "missingGlyphs",
    );
    expect(alone.dispatch).not.toHaveBeenCalled();
    expect(loadScriptScanFaces).not.toHaveBeenCalled();
  });

  it("fetches the script fonts for text a change would lose before giving up on it", async () => {
    losesText.add("a");
    loadScriptScanFaces.mockImplementationOnce(async () => {
      losesText.clear();
    });
    lacksLetters.add("a");
    const { store, dispatch } = fakeStore(
      [run("a", "pdf:7:Noto Sans", "Total ภาษาไทย")],
      ["a"],
    );

    expect(await actionsFor(store).changeFontFamily("Helvetica")).toBe(
      "closestMatch",
    );

    expect(loadScriptScanFaces).toHaveBeenCalledWith(["thai"]);
    expect(dispatchedChanges(dispatch)).toEqual(["a:Helvetica"]);
  });

  it("puts text back in the PDF's own font without loading any font bytes", async () => {
    const { store, dispatch } = fakeStore(
      [run("a", "device:Acme Sans")],
      ["a"],
    );

    expect(
      await actionsFor(store).changeFontFamily("pdf:7:Garamond"),
    ).toBeNull();

    expect(get).not.toHaveBeenCalled();
    expect(dispatchedChanges(dispatch)).toEqual(["a:pdf:7:Garamond"]);
  });

  it("drops a font still loading once a later font change has been made", async () => {
    const finishDownload = holdDownloads();
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "device:Acme Sans")],
      ["a"],
    );
    const actions = actionsFor(store);

    const pending = actions.changeFontFamily("Acme Sans Italic");
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await actions.changeFontFamily("pdf:7:Garamond");
    finishDownload(fontBytes());
    await pending;

    expect(dispatchedChanges(dispatch)).toEqual(["a:pdf:7:Garamond"]);
  });

  it("drops a font still loading once the runs were rebuilt under the same ids", async () => {
    const finishDownload = holdDownloads();
    await loadServerFonts();
    const runs = [run("a", "base14:Helvetica")];
    const { store, dispatch } = fakeStore(runs, ["a"]);

    const picked = actionsFor(store).changeFontFamily("Acme Sans");
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    runs[0] = { ...runs[0], text: "Hello\nworld" };
    finishDownload(fontBytes());

    expect(await picked).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("still applies a font still loading for text a later change did not touch", async () => {
    const finishDownload = holdDownloads();
    await loadServerFonts();
    const { store, dispatch, select } = fakeStore(
      [run("a", "device:Acme Sans"), run("b", "device:Acme Sans")],
      ["a"],
    );
    const actions = actionsFor(store);

    const pending = actions.changeFontFamily("Acme Sans Italic");
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    select(["b"]);
    await actions.changeFontFamily("pdf:7:Garamond");
    finishDownload(fontBytes());
    await pending;

    expect(dispatchedChanges(dispatch)).toEqual([
      "b:pdf:7:Garamond",
      "a:Acme Sans Italic",
    ]);
  });

  it("makes a half-bold selection all bold", async () => {
    const { store, dispatch } = fakeStore(
      [run("a", "base14:Helvetica"), run("b", "base14:Helvetica-Bold")],
      ["a", "b"],
    );

    expect(await actionsFor(store).toggleBold()).toBeNull();

    expect(dispatchedChanges(dispatch)).toEqual(["a:Helvetica-Bold"]);
  });

  it("moves document text to the document's own bold face", async () => {
    documentFont(7, "ABCDEF+Calibri", 0);
    documentFont(8, "GHIJKL+Calibri-Bold", 0);
    const { store, dispatch } = fakeStore(
      [run("a", "pdf:7:Calibri"), run("b", "pdf:8:Calibri")],
      ["a"],
    );

    expect(await actionsFor(store).toggleBold()).toBeNull();

    expect(get).not.toHaveBeenCalled();
    expect(dispatchedChanges(dispatch)).toEqual(["a:pdf:8:Calibri"]);
  });

  it("makes no bold up for a family that has no bold face, and says so", async () => {
    documentFont(7, "ABCDEF+Garamond", 0);
    const { store, dispatch } = fakeStore([run("a", "pdf:7:Garamond")], ["a"]);

    expect(await actionsFor(store).toggleBold()).toBe("styleUnavailable");

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("warns that letters the bold face lacks are drawn in the closest match", async () => {
    lacksLetters.add("a");
    const { store, dispatch } = fakeStore(
      [run("a", "base14:Helvetica", "Hello שלום")],
      ["a"],
    );

    expect(await actionsFor(store).toggleBold()).toBe("closestMatch");

    expect(dispatchedChanges(dispatch)).toEqual(["a:Helvetica-Bold"]);
  });

  it("says so when the italic toggle leaves some of the selection upright", async () => {
    serveFaces(async (id) => {
      if (id === ITALIC) throw new Error("gone");
      return fontBytes();
    });
    await loadServerFonts();
    const { store, dispatch } = fakeStore(
      [run("a", "base14:Helvetica"), run("b", "device:Acme Sans")],
      ["a", "b"],
    );

    expect(await actionsFor(store).toggleItalic()).toBe("styleSkipped");

    expect(dispatchedChanges(dispatch)).toEqual(["a:Helvetica-Oblique"]);
  });
});

describe("useSelectionActions on unfitted scanned text", () => {
  afterEach(() => {
    vi.mocked(prefitScanRun).mockReset().mockReturnValue(true);
    vi.mocked(scanRunNeedsFit).mockReset().mockReturnValue(false);
  });

  it("fits the scanned blocks in slices behind a busy state before recolouring", async () => {
    const fitted = new Set<string>();
    let calls = 0;
    vi.mocked(scanRunNeedsFit).mockImplementation(
      (_doc, r) => !fitted.has(r.id),
    );
    vi.mocked(prefitScanRun).mockImplementation((_doc, _page, r) => {
      calls++;
      if (calls < 3) return false;
      fitted.add(r.id);
      return true;
    });
    const { store, dispatch } = fakeStore(
      [run("scan", "base14:Helvetica")],
      ["scan"],
    );
    const { result } = renderHook(() => useSelectionActions(store));

    act(() => result.current.changeFill("#ff0000"));

    expect(dispatch).not.toHaveBeenCalled();
    expect(result.current.fittingScan).toBe(true);
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.fittingScan).toBe(false));
    expect(calls).toBe(3);
    for (const [, , , deadline] of vi.mocked(prefitScanRun).mock.calls)
      expect(Number.isFinite(deadline)).toBe(true);
  });

  it("builds each change from the run as it is once the fit has finished", async () => {
    const fitted = new Set<string>();
    vi.mocked(scanRunNeedsFit).mockImplementation(
      (_doc, r) => !fitted.has(r.id),
    );
    const runs = [
      run("scan", "base14:Helvetica"),
      run("gone", "base14:Helvetica"),
    ];
    vi.mocked(prefitScanRun).mockImplementation((_doc, _page, r) => {
      if (runs[0].fill.a === 255) {
        runs[0].fill = { ...runs[0].fill, a: 128 };
        runs.splice(1, 1);
        return false;
      }
      fitted.add(r.id);
      return true;
    });
    const { store, dispatch } = fakeStore(runs, ["scan", "gone"]);
    const { result } = renderHook(() => useSelectionActions(store));

    act(() => result.current.changeFill("#ff0000"));

    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    const dispatched = dispatch.mock.calls[0][0] as {
      runId: string;
      nextFill: { r: number; a: number };
    };
    expect(dispatched.runId).toBe("scan");
    expect(dispatched.nextFill).toMatchObject({ r: 255, a: 128 });
  });
});
