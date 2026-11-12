import { readFileSync } from "node:fs";
import path from "node:path";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));
vi.mock("@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand", () => ({
  SetFontFamilyCommand: class {
    constructor(readonly opts: { runId: string; nextFamily: string }) {}
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
  resetServerFontsCache,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { resetLocalFontsCache } from "@editor/tools/pdfTextEditor/util/localFonts";
import { resetDeviceFontEmbedCache } from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  prefitScanRun,
  scanRunNeedsFit,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";

const REGULAR = "1".repeat(64);
const ITALIC = "2".repeat(64);
const HEBREW = "5".repeat(64);

const HEBREW_TTF = readFileSync(
  path.resolve(
    __dirname,
    "../../../../../../../app/core/src/main/resources/static/fonts/NotoSansHebrew-Regular.ttf",
  ),
);

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
      registerOwnedFont: (font: { id: string }) => owned.set(font.id, font),
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
  const store = {
    selection,
    dispatch,
    get document() {
      return doc;
    },
  } as unknown as EditorStore;
  return {
    store,
    dispatch,
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

function fontBytes(): { data: ArrayBuffer } {
  return { data: new Uint8Array([0, 1, 0, 0]).buffer };
}

function actionsFor(store: EditorStore) {
  return renderHook(() => useSelectionActions(store)).result.current;
}

describe("useSelectionActions font changes", () => {
  beforeEach(() => {
    get.mockReset();
    resetServerFontsCache();
    resetLocalFontsCache();
    resetDeviceFontEmbedCache();
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
    let finishDownload: (value: { data: ArrayBuffer }) => void = () => {};
    serveFaces(
      () =>
        new Promise((resolve) => {
          finishDownload = resolve;
        }),
    );
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
    let finishDownload: (value: { data: ArrayBuffer }) => void = () => {};
    serveFaces(
      () =>
        new Promise((resolve) => {
          finishDownload = resolve;
        }),
    );
    await loadServerFonts();
    const { store, dispatch, openAnotherDocument } = fakeStore(
      [run("a", "base14:Helvetica")],
      ["a"],
    );

    const picked = actionsFor(store).changeFontFamily("Acme Sans");
    openAnotherDocument();
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    finishDownload(fontBytes());

    expect(await picked).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("skips runs removed during the download and records nothing when none remain", async () => {
    let finishDownload: (value: { data: ArrayBuffer }) => void = () => {};
    serveFaces(
      () =>
        new Promise((resolve) => {
          finishDownload = resolve;
        }),
    );
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

  it("refuses a font that has none of the selected characters", async () => {
    serveFaces(async () => ({
      data: HEBREW_TTF.buffer.slice(
        HEBREW_TTF.byteOffset,
        HEBREW_TTF.byteOffset + HEBREW_TTF.byteLength,
      ),
    }));
    await loadServerFonts();
    const english = fakeStore([run("a", "base14:Helvetica", "Hello")], ["a"]);
    const mixed = fakeStore(
      [run("b", "base14:Helvetica", "Hello שלום")],
      ["b"],
    );

    expect(
      await actionsFor(english.store).changeFontFamily("Noto Sans Hebrew"),
    ).toBe("noGlyphs");
    expect(english.dispatch).not.toHaveBeenCalled();

    expect(
      await actionsFor(mixed.store).changeFontFamily("Noto Sans Hebrew"),
    ).toBeNull();
    expect(dispatchedChanges(mixed.dispatch)).toEqual(["b:Noto Sans Hebrew"]);
  });

  it("puts text back in the PDF's own font without fetching anything", async () => {
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
