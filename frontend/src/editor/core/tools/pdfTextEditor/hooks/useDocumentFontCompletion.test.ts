import { beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDocumentFontCompletion } from "@editor/tools/pdfTextEditor/hooks/useDocumentFontCompletion";
import { setClosestFont } from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import { matchableSample } from "@editor/tools/pdfTextEditor/util/matchableSample";
import { rankFacesForDrawnText } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import {
  loadScriptScanFaces,
  scanScriptsOf,
} from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";

vi.mock("@editor/tools/pdfTextEditor/util/documentFontCompletion", () => ({
  fontCanBeCompleted: () => true,
  fontCompletionFor: () => null,
  fontCompletionsGeneration: () => 0,
  originalFontLookedUp: () => true,
  resolveOriginalFonts: vi.fn(() => Promise.resolve()),
  setClosestFont: vi.fn(),
  subscribeFontCompletions: () => () => {},
}));

vi.mock("@editor/tools/pdfTextEditor/util/externalFonts", () => ({
  loadedExternalFonts: () => null,
  subscribeExternalFonts: () => () => {},
}));

vi.mock("@editor/tools/pdfTextEditor/util/localFonts", () => ({
  listLocalFontsIfGranted: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@editor/tools/pdfTextEditor/util/fontFamily", () => ({
  isDocumentFontId: () => true,
}));

vi.mock("@editor/tools/pdfTextEditor/util/matchableSample", () => ({
  matchableSample: vi.fn(),
}));

vi.mock("@editor/tools/pdfTextEditor/commands/scanTextEdit", () => ({
  isScanRun: () => false,
  rankFacesForDrawnText: vi.fn(),
}));

vi.mock("@editor/tools/pdfTextEditor/commands/scanFitSlices", () => ({
  fitInSlices: <T>(fit: () => T) => Promise.resolve(fit()),
}));

vi.mock(
  "@editor/tools/pdfTextEditor/util/scanFontLibrary",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadBundledScanFaces: vi.fn(() => Promise.resolve()),
    loadDeviceScanFacesIfAllowed: vi.fn(() => Promise.resolve()),
    loadScriptScanFaces: vi.fn(() => Promise.resolve()),
  }),
);

const FONT = "F1";

function pagesOf(count: number): EditorViewState["pages"] {
  return Array.from({ length: count }, (_, pageIndex) => ({
    pageIndex,
    runs: [{ id: `r${pageIndex}`, fontId: FONT, text: "Invoice total" }],
  })) as unknown as EditorViewState["pages"];
}

function setup(pageCount: number) {
  let loaded = pageCount;
  const doc = {
    module: {},
    loadedPages: () =>
      Array.from({ length: loaded }, (_, index) => ({ index, runs: [] })),
  } as unknown as EditorDocument;
  const store = { document: doc } as unknown as EditorStore;
  const selection = { runIds: [] };
  const view = renderHook(
    ({ pages }) =>
      useDocumentFontCompletion(
        store,
        { pages } as EditorViewState,
        selection as never,
        null,
      ),
    { initialProps: { pages: pagesOf(pageCount) } },
  );
  return {
    edit: () => view.rerender({ pages: pagesOf(loaded) }),
    loadPage: () => {
      loaded++;
      view.rerender({ pages: pagesOf(loaded) });
    },
  };
}

function sampleWith(text: string) {
  return {
    page: { index: 0 },
    captured: {},
    text,
  } as unknown as ReturnType<typeof matchableSample>;
}

beforeEach(() => {
  vi.mocked(matchableSample).mockReset();
  vi.mocked(rankFacesForDrawnText).mockReset();
  vi.mocked(setClosestFont).mockReset();
  vi.mocked(loadScriptScanFaces).mockClear();
  vi.mocked(rankFacesForDrawnText).mockReturnValue([
    { style: { family: "Noto Sans JP" } },
  ] as never);
});

describe("useDocumentFontCompletion", () => {
  test("matches a font once a later page gives it a usable sample", async () => {
    vi.mocked(matchableSample).mockReturnValue(null);
    const { loadPage } = setup(1);
    await waitFor(() => expect(matchableSample).toHaveBeenCalled());
    expect(setClosestFont).not.toHaveBeenCalled();

    vi.mocked(matchableSample).mockReturnValue(sampleWith("Invoice total"));
    loadPage();
    await waitFor(() =>
      expect(setClosestFont).toHaveBeenCalledWith(FONT, "Noto Sans JP"),
    );
  });

  test("samples an unsampled font again only when more pages load", async () => {
    vi.mocked(matchableSample).mockReturnValue(null);
    const { edit, loadPage } = setup(1);
    await waitFor(() => expect(matchableSample).toHaveBeenCalledTimes(1));
    edit();
    vi.mocked(matchableSample).mockReturnValue(sampleWith("Invoice total"));
    loadPage();
    await waitFor(() => expect(setClosestFont).toHaveBeenCalled());
    expect(matchableSample).toHaveBeenCalledTimes(2);
  });

  test("loads the server faces for the sample's script before ranking", async () => {
    const text = "請求書 お支払い ください";
    vi.mocked(matchableSample).mockReturnValue(sampleWith(text));
    let scriptsLoaded = false;
    vi.mocked(loadScriptScanFaces).mockImplementation(async () => {
      scriptsLoaded = true;
    });
    let loadedBeforeRanking = false;
    vi.mocked(rankFacesForDrawnText).mockImplementation(() => {
      loadedBeforeRanking = scriptsLoaded;
      return [{ style: { family: "Noto Sans JP" } }] as never;
    });
    setup(1);
    await waitFor(() => expect(setClosestFont).toHaveBeenCalled());
    expect(loadScriptScanFaces).toHaveBeenCalledWith(scanScriptsOf(text));
    expect(scanScriptsOf(text).length).toBeGreaterThan(0);
    expect(loadedBeforeRanking).toBe(true);
  });
});
