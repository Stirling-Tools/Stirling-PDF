import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { fit, focusRunWhenPainted } = vi.hoisted(() => ({
  fit: { done: false },
  focusRunWhenPainted: vi.fn(),
}));

vi.mock(
  "@editor/tools/pdfTextEditor/commands/scanTextEdit",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    scanRunNeedsFit: vi.fn(() => !fit.done),
    prefitScanRun: vi.fn(() => fit.done),
  }),
);
vi.mock(
  "@editor/tools/pdfTextEditor/util/wrapText",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    lineWidthIn: () => (line: string) => line.length * 6,
  }),
);
vi.mock("@editor/tools/pdfTextEditor/util/dom", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  focusRunWhenPainted,
}));

import { useSelectionActions } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

function listRun(id: string) {
  return {
    id,
    pageIndex: 0,
    fontId: "base14:Helvetica",
    text: "Apples",
    locked: false,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSize: 12,
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    paragraphSoftStarts: [],
    paragraphSoftStartsText: "Apples",
  };
}

function editorWith(ids: string[]) {
  const runs = ids.map(listRun);
  const dispatch = vi.fn();
  const store = {
    selection: { value: { runIds: [ids[0]], imageIds: [], shapeIds: [] } },
    dispatch,
    setError: vi.fn(),
    document: {
      disposed: false,
      loadedPages: () => [{ index: 0, runs }],
      page: () => ({ index: 0, runs }),
    },
  } as unknown as EditorStore;
  return { store, dispatch };
}

function runField(id: string): HTMLInputElement {
  const box = document.createElement("div");
  box.dataset.runId = id;
  const field = document.createElement("input");
  box.append(field);
  document.body.append(box);
  return field;
}

beforeEach(() => {
  fit.done = false;
  focusRunWhenPainted.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

it("puts the caret back in the listed text once a scanned fit lets the list through", async () => {
  const { store, dispatch } = editorWith(["a"]);
  runField("a").focus();
  const { result } = renderHook(() => useSelectionActions(store));

  act(() => result.current.toggleList("bullet"));
  fit.done = true;

  await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(focusRunWhenPainted).toHaveBeenCalledWith(
      "a",
      true,
      undefined,
      undefined,
    ),
  );
});

it("leaves the caret in the text the user moved to while a scanned fit held the list back", async () => {
  const { store, dispatch } = editorWith(["a", "b"]);
  runField("a").focus();
  const other = runField("b");
  const { result } = renderHook(() => useSelectionActions(store));

  act(() => result.current.toggleList("bullet"));
  other.focus();
  fit.done = true;

  await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
  expect(focusRunWhenPainted).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(other);
});
