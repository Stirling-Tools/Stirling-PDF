import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScanPrefit } from "@editor/tools/pdfTextEditor/hooks/useScanPrefit";
import { setPreferredScanFace } from "@editor/tools/pdfTextEditor/commands/scanFit";
import {
  prefitScanRun,
  scanRunNeedsFit,
} from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { loadBundledScanFaces } from "@editor/tools/pdfTextEditor/util/scanFontLibrary";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type {
  EditorStore,
  EditorViewState,
} from "@editor/tools/pdfTextEditor/store/EditorStore";

vi.mock("@editor/tools/pdfTextEditor/commands/scanTextEdit", () => ({
  prefitScanRun: vi.fn(),
  scanRunNeedsFit: vi.fn(),
}));

vi.mock(
  "@editor/tools/pdfTextEditor/util/scanFontLibrary",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    loadBundledScanFaces: vi.fn(() => Promise.resolve()),
    loadScriptScanFaces: vi.fn(() => Promise.resolve()),
  }),
);

const fitted = new Set<string>();
const order: string[] = [];
let failing = new Set<string>();

function setup(
  pages: Array<{ ids: string[]; near: boolean; shown?: boolean }>,
) {
  const near = new Set(pages.flatMap((p, i) => (p.near ? [i] : [])));
  const unshown = new Set(
    pages.flatMap((p, i) => (p.shown === false ? [i] : [])),
  );
  const nearListeners = new Set<() => void>();
  const selectionListeners = new Set<() => void>();
  const doc = {
    loadedPages: () =>
      pages.map((p, index) => ({
        index,
        shownInViewer: !unshown.has(index),
        runs: p.ids.map((id) => runs.get(id)!),
      })),
  } as unknown as EditorDocument;
  const runs = new Map(pages.flatMap((p) => p.ids.map((id) => [id, { id }])));
  const selection = { runIds: [] as string[] };
  const store = {
    document: doc,
    selection: {
      get value() {
        return selection;
      },
      subscribe: (l: () => void) => {
        selectionListeners.add(l);
        return () => selectionListeners.delete(l);
      },
    },
    isPageNearViewport: (i: number) => near.has(i),
    subscribeNearViewport: (l: () => void) => {
      nearListeners.add(l);
      return () => nearListeners.delete(l);
    },
  } as unknown as EditorStore;
  const state = {
    pages: pages.map((p, pageIndex) => ({
      pageIndex,
      runs: p.ids.map((id) => ({ id, renderMode: 3, text: "Invoice" })),
    })),
  } as unknown as EditorViewState;
  const view = renderHook(() => useScanPrefit(store, state));
  return {
    doc,
    view,
    select: (ids: string[]) => {
      selection.runIds = ids;
      for (const l of [...selectionListeners]) l();
    },
    bringNear: (i: number) => {
      near.add(i);
      for (const l of [...nearListeners]) l();
    },
    draw: (i: number) => unshown.delete(i),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  fitted.clear();
  order.length = 0;
  failing = new Set();
  vi.mocked(scanRunNeedsFit).mockImplementation(
    (_doc, run) => !fitted.has(run.id),
  );
  vi.mocked(prefitScanRun).mockImplementation((_doc, _page, run) => {
    order.push(run.id);
    if (failing.has(run.id)) throw new Error("unfittable");
    fitted.add(run.id);
    return true;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("background scan font fitting", () => {
  test("fits the selected run before earlier runs on the page", async () => {
    const { select } = setup([{ ids: ["a", "b", "c"], near: true }]);
    select(["c"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["c", "a", "b"]);
  });

  test("leaves runs on far pages until one is selected or the page comes near", async () => {
    const { select, bringNear } = setup([
      { ids: ["a"], near: true },
      { ids: ["b", "c"], near: false },
      { ids: ["d"], near: false },
    ]);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["a"]);
    select(["d"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["a", "d"]);
    bringNear(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["a", "d", "b", "c"]);
  });

  test("waits for the viewer to draw a page, even for a selected run", async () => {
    const { select, draw } = setup([{ ids: ["a"], near: true, shown: false }]);
    select(["a"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual([]);
    draw(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toEqual(["a"]);
  });

  test("skips a run that cannot be fitted and finishes the rest", async () => {
    failing = new Set(["a"]);
    setup([{ ids: ["a", "b"], near: true }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["a", "b"]);
  });

  test("waits for the bundled fonts before fitting", async () => {
    let loaded = () => {};
    vi.mocked(loadBundledScanFaces).mockReturnValueOnce(
      new Promise<void>((resolve) => (loaded = resolve)),
    );
    setup([{ ids: ["a"], near: true }]);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual([]);
    loaded();
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["a"]);
  });

  test("an idle loop starts again when the preferred face changes", async () => {
    const { doc } = setup([{ ids: ["a"], near: true }]);
    await vi.advanceTimersByTimeAsync(100);
    fitted.delete("a");
    setPreferredScanFace(doc, "Courier");
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(["a", "a"]);
    setPreferredScanFace(doc, null);
  });

  test("pauses while the page is hidden", async () => {
    let hidden = true;
    const spy = vi
      .spyOn(document, "hidden", "get")
      .mockImplementation(() => hidden);
    try {
      setup([{ ids: ["a"], near: true }]);
      await vi.advanceTimersByTimeAsync(100);
      expect(order).toEqual([]);
      hidden = false;
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(100);
      expect(order).toEqual(["a"]);
    } finally {
      spy.mockRestore();
    }
  });

  test("stops fitting once unmounted", async () => {
    const { view, select } = setup([{ ids: ["a", "b"], near: false }]);
    select(["a"]);
    view.unmount();
    select(["b"]);
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual([]);
  });
});
