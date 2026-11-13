import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { ensureDeviceFontReady } = vi.hoisted(() => ({
  ensureDeviceFontReady: vi.fn(async () => true),
}));
vi.mock("@editor/tools/pdfTextEditor/util/deviceFontEmbed", () => ({
  ensureDeviceFontReady,
}));
vi.mock("@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand", () => ({
  SetFontFamilyCommand: class {
    constructor(readonly opts: { runId: string; nextFamily: string }) {}
  },
}));
vi.mock("@editor/tools/pdfTextEditor/util/fontCapability", () => ({
  italicCapability: (fontId: string) => ({
    family: `${fontId} Italic`,
    source: "device",
  }),
}));
vi.mock("@editor/tools/pdfTextEditor/commands/CompositeCommand", () => ({
  CompositeCommand: class {
    constructor(readonly commands: unknown[]) {}
  },
}));

import { useSelectionActions } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

function fakeStore(fontId: string, runIds: string[] = ["a"]) {
  const runs = runIds.map((id) => ({
    id,
    pageIndex: 0,
    fontId,
    locked: false,
    fill: { r: 0, g: 0, b: 0, a: 255 },
  }));
  const selection = { value: { runIds: [runIds[0]] } };
  const dispatch = vi.fn();
  const store = {
    selection,
    dispatch,
    document: { loadedPages: () => [{ runs }] },
  } as unknown as EditorStore;
  const select = (id: string) => (selection.value = { runIds: [id] });
  return { store, dispatch, select };
}

function holdFontLoad(): (ready: boolean) => void {
  let finishLoading: (ready: boolean) => void = () => {};
  ensureDeviceFontReady.mockImplementationOnce(
    () => new Promise<boolean>((resolve) => (finishLoading = resolve)),
  );
  return (ready) => finishLoading(ready);
}

function dispatchedChanges(dispatch: ReturnType<typeof vi.fn>): string[] {
  return dispatch.mock.calls.map(([cmd]) => {
    const { opts } = cmd as { opts: { runId: string; nextFamily: string } };
    return `${opts.runId}:${opts.nextFamily}`;
  });
}

describe("useSelectionActions font changes", () => {
  it("puts text back in the PDF's own font without loading any font bytes", async () => {
    ensureDeviceFontReady.mockClear();
    const { store, dispatch } = fakeStore("device:Acme Sans");
    const actions = renderHook(() => useSelectionActions(store)).result.current;

    await actions.changeFontFamily("pdf:7:Garamond");

    expect(ensureDeviceFontReady).not.toHaveBeenCalled();
    expect(dispatchedChanges(dispatch)).toEqual(["a:pdf:7:Garamond"]);
  });

  it("still warms the bytes for any other family", async () => {
    ensureDeviceFontReady.mockClear();
    const { store, dispatch } = fakeStore("pdf:7:Garamond");
    const actions = renderHook(() => useSelectionActions(store)).result.current;

    await actions.changeFontFamily("Acme Sans");

    expect(ensureDeviceFontReady).toHaveBeenCalledWith("Acme Sans");
    expect(dispatchedChanges(dispatch)).toEqual(["a:Acme Sans"]);
  });

  it("drops a font still loading once a later font change has been made", async () => {
    const finishLoading = holdFontLoad();
    const { store, dispatch } = fakeStore("device:Acme Sans");
    const actions = renderHook(() => useSelectionActions(store)).result.current;

    const pending = actions.changeFontFamily("Slow Serif");
    await actions.changeFontFamily("pdf:7:Garamond");
    finishLoading(true);
    await pending;

    expect(dispatchedChanges(dispatch)).toEqual(["a:pdf:7:Garamond"]);
  });

  it("still applies a font still loading for text a later change did not touch", async () => {
    const finishLoading = holdFontLoad();
    const { store, dispatch, select } = fakeStore("device:Acme Sans", [
      "a",
      "b",
    ]);
    const actions = renderHook(() => useSelectionActions(store)).result.current;

    const pending = actions.changeFontFamily("Slow Serif");
    select("b");
    await actions.changeFontFamily("pdf:7:Garamond");
    finishLoading(true);
    await pending;

    expect(dispatchedChanges(dispatch)).toEqual([
      "b:pdf:7:Garamond",
      "a:Slow Serif",
    ]);
  });

  it("still applies an italic still loading for text a later change did not touch", async () => {
    const finishLoading = holdFontLoad();
    const { store, dispatch, select } = fakeStore("device:Acme Sans", [
      "a",
      "b",
    ]);
    const actions = renderHook(() => useSelectionActions(store)).result.current;

    const pending = actions.toggleItalic();
    select("b");
    await actions.changeFontFamily("pdf:7:Garamond");
    finishLoading(true);
    await pending;

    expect(dispatchedChanges(dispatch)).toEqual([
      "b:pdf:7:Garamond",
      "a:device:Acme Sans Italic",
    ]);
  });
});
