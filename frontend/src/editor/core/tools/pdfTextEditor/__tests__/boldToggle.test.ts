import { act, renderHook } from "@testing-library/react";
import { beforeAll, expect, test, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { useSelectionActions } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  editorStores,
  savedBytes,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

const FPDF_PAGEOBJ_TEXT = 1;

servePdfiumWasm();
const { storeWith, fixture } = editorStores();

beforeAll(() => {
  get.mockRejectedValue(new Error("no server fonts"));
  // jsdom has no canvas; text measurement falls back without one.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

function runOf(store: EditorStore, text: string): TextRun {
  return store.document!.page(0).runs.find((r) => r.text === text)!;
}

/** The /BaseFont each piece of a run is drawn in, with the text it draws, as "text@Font". */
function pieces(store: EditorStore, text: string): string[] {
  const doc = store.document!;
  const m = doc.module;
  const page = doc.page(0);
  const buf = m.pdfium.wasmExports.malloc(2048);
  const name = m.pdfium.wasmExports.malloc(256);
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  try {
    return collectMemberPtrs(runOf(store, text))
      .filter((ptr) => ptr && m.FPDFPageObj_GetType(ptr) === FPDF_PAGEOBJ_TEXT)
      .map((ptr) => {
        m.FPDFTextObj_GetText(ptr, textPage, buf, 2048);
        m.FPDFFont_GetBaseFontName(m.FPDFTextObj_GetFont(ptr), name, 256);
        const font = m.pdfium.UTF8ToString(name).replace(/^[A-Z]{6}\+/, "");
        return `${m.pdfium.UTF16ToString(buf)}@${font}`;
      });
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(buf);
    m.pdfium.wasmExports.free(name);
  }
}

function fonts(store: EditorStore, text: string): string[] {
  return [...new Set(pieces(store, text).map((p) => p.split("@")[1]))].sort();
}

/** The run's text as its objects draw it, spaces aside. */
function drawnText(store: EditorStore, text: string): string {
  return pieces(store, text)
    .map((p) => p.split("@")[0])
    .join("")
    .replace(/\s+/g, "");
}

function select(store: EditorStore, text: string): void {
  store.selection.selectOne(runOf(store, text).id);
}

async function toggleBold(store: EditorStore) {
  const { result } = renderHook(() => useSelectionActions(store));
  let failure: unknown;
  await act(async () => {
    failure = await result.current.toggleBold();
  });
  return failure;
}

test("Bold off moves a heading to the document's regular face, keeps its text, and undoes and redoes", async () => {
  const store = await fixture("mushroom-life.pdf");
  const heading = "Spore Stage";
  expect(fonts(store, heading)).toEqual(["LMRoman12-Bold"]);
  select(store, heading);

  expect(await toggleBold(store)).toBeNull();

  expect(fonts(store, heading)).toEqual(["LMRoman12-Regular"]);
  expect(drawnText(store, heading)).toBe("SporeStage");

  store.undo();
  expect(fonts(store, heading)).toEqual(["LMRoman12-Bold"]);
  store.redo();
  expect(fonts(store, heading)).toEqual(["LMRoman12-Regular"]);
  expect(drawnText(store, heading)).toBe("SporeStage");

  const saved = await storeWith(await savedBytes(store));
  expect(fonts(saved, heading)).toEqual(["LMRoman12-Regular"]);
});

test("a letter the regular subset lacks stays in the bold face it was drawn in, and the user is told", async () => {
  const store = await fixture("mushroom-life.pdf");
  select(store, "Introduction");

  expect(await toggleBold(store)).toBe("closestMatch");

  expect(pieces(store, "Introduction")).toEqual([
    "I@LMRoman12-Bold",
    "ntroduction@LMRoman12-Regular",
  ]);
});

test("Bold on draws the letters the bold subset lacks in the closest match and says so", async () => {
  const store = await fixture("coloured-word-sample.pdf");
  const line = "Total due today  by card";
  expect(fonts(store, line)).toEqual(["LiberationSans", "LiberationSans-Bold"]);
  select(store, line);

  expect(await toggleBold(store)).toBe("closestMatch");

  const bold = () =>
    pieces(store, line)
      .filter((p) => p.endsWith("@LiberationSans-Bold"))
      .map((p) => p.split("@")[0])
      .join("");
  expect(bold()).toMatch(/otal.*d.*e.*today.*y.*ca.*d/);
  expect(bold()).not.toMatch(/[Tubr]/);
  expect(drawnText(store, line)).toBe("Totalduetodaybycard");
  expect(
    store.document!.page(0).runs.find((r) => r.text === line)?.fontId,
  ).toMatch(/^pdf:\d+:/);

  store.undo();
  expect(bold()).toBe("today ");
  store.redo();
  expect(bold()).not.toMatch(/[Tubr]/);
  expect(drawnText(store, line)).toBe("Totalduetodaybycard");
});
