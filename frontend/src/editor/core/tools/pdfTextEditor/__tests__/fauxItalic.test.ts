import { act, renderHook } from "@testing-library/react";
import { beforeAll, expect, test, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { useSelectionActions } from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import {
  KeepObliqueCommand,
  SetObliqueCommand,
} from "@editor/tools/pdfTextEditor/commands/SetObliqueCommand";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { readMatrix } from "@editor/tools/pdfTextEditor/commands/textPieces";
import {
  FAUX_ITALIC_SLANT,
  isFauxItalic,
  slantOf,
  withSlant,
} from "@editor/tools/pdfTextEditor/util/fauxItalic";
import { deriveToolbarState } from "@editor/tools/pdfTextEditor/util/toolbarState";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { PageSnapshot } from "@editor/tools/pdfTextEditor/types";
import {
  editorStores,
  savedBytes,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { storeWith, fixture } = editorStores();

beforeAll(() => {
  get.mockRejectedValue(new Error("no server fonts"));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

function firstRun(store: EditorStore): TextRun {
  return store.document!.page(0).runs[0];
}

function memberMatrices(store: EditorStore, run: TextRun): Float32Array[] {
  const m = store.document!.module;
  return [...new Set(collectMemberPtrs(run))].map((ptr) => readMatrix(m, ptr)!);
}

function memberSlants(store: EditorStore, run: TextRun): number[] {
  return memberMatrices(store, run).map(([a, b, c, d]) =>
    slantOf({ a, b, c, d }),
  );
}

function toolbar(store: EditorStore, rangeFontIds: string[] | null = null) {
  const page = store.document!.page(0);
  const pages = [
    {
      pageIndex: 0,
      runs: page.runs.map((r) => r.snapshot()),
      images: [],
    } as unknown as PageSnapshot,
  ];
  return deriveToolbarState(pages, store.selection.value, null, rangeFontIds);
}

function lean(store: EditorStore, oblique = true) {
  const run = firstRun(store);
  store.dispatch(
    new SetObliqueCommand({ pageIndex: 0, runId: run.id, oblique }),
  );
  return run;
}

test("withSlant leans upright, scaled and rotated matrices by the same visible slant", () => {
  const turn = Math.PI / 6;
  for (const matrix of [
    { a: 1, b: 0, c: 0, d: 1 },
    { a: 1.4, b: 0, c: 0, d: 0.9 },
    {
      a: Math.cos(turn),
      b: Math.sin(turn),
      c: -Math.sin(turn),
      d: Math.cos(turn),
    },
  ]) {
    const leaned = withSlant(matrix, FAUX_ITALIC_SLANT);
    expect(slantOf(leaned)).toBeCloseTo(FAUX_ITALIC_SLANT, 6);
    expect(leaned.a).toBe(matrix.a);
    expect(leaned.b).toBe(matrix.b);
    expect(slantOf(withSlant(leaned, 0))).toBeCloseTo(0, 6);
  }
});

test("leaning shears every glyph about its baseline origin, and undo puts back each object's exact matrix", async () => {
  const store = await fixture("subset-font-sample.pdf");
  const run = firstRun(store);
  const before = memberMatrices(store, run);
  const matrix = { ...run.matrix };
  const bounds = { ...run.bounds };

  lean(store);

  expect(isFauxItalic(run)).toBe(true);
  expect(run.matrix.c / run.matrix.d).toBeCloseTo(FAUX_ITALIC_SLANT, 4);
  const after = memberMatrices(store, run);
  for (const [i, leaned] of after.entries()) {
    expect(
      slantOf({ a: leaned[0], b: leaned[1], c: leaned[2], d: leaned[3] }),
    ).toBeCloseTo(FAUX_ITALIC_SLANT, 3);
    expect(leaned[4]).toBe(before[i][4]);
    expect(leaned[5]).toBe(before[i][5]);
  }
  expect(run.bounds.x + run.bounds.width).toBeGreaterThan(
    bounds.x + bounds.width,
  );

  store.undo();
  expect(memberMatrices(store, run)).toEqual(before);
  expect(run.matrix).toEqual(matrix);
  expect(run.bounds).toEqual(bounds);
  expect(isFauxItalic(run)).toBe(false);
});

test("the toolbar offers italic for a font with no italic face, shows it pressed once leaned, and Italic turns it off", async () => {
  const store = await fixture("subset-font-sample.pdf");
  const run = firstRun(store);
  const fontId = run.fontId;
  store.selection.selectOne(run.id);
  expect(toolbar(store)).toMatchObject({ italic: false, canItalic: true });

  const { result } = renderHook(() => useSelectionActions(store));
  let failure: unknown;
  await act(async () => {
    failure = await result.current.toggleItalic();
  });
  expect(failure).toBeNull();
  expect(isFauxItalic(run)).toBe(true);
  expect(run.fontId).toBe(fontId);
  expect(toolbar(store)).toMatchObject({ italic: true, canItalic: true });

  await act(async () => {
    failure = await result.current.toggleItalic();
  });
  expect(failure).toBeNull();
  expect(isFauxItalic(run)).toBe(false);
  expect(memberSlants(store, run).every((s) => Math.abs(s) < 1e-3)).toBe(true);
  expect(toolbar(store).italic).toBe(false);
});

test("the toolbar does not offer a lean for only part of a run", async () => {
  const store = await fixture("subset-font-sample.pdf");
  const run = firstRun(store);
  store.selection.selectOne(run.id);
  const state = toolbar(store, [run.fontId]);
  expect(toolbar(store).canItalic).toBe(true);
  expect(state.canItalic).toBe(false);
});

test("a leaned run stays leaned when moved, resized and given another family, and undo returns each step", async () => {
  const store = await fixture("subset-font-sample.pdf");
  const run = lean(store);
  store.selection.selectOne(run.id);
  const { result } = renderHook(() => useSelectionActions(store));

  store.dispatch(
    new MoveTextRunCommand({ pageIndex: 0, runId: run.id, dx: 5, dy: 5 }),
  );
  await act(async () => {
    await result.current.changeFontSize(20);
  });
  store.dispatch(
    new KeepObliqueCommand(
      new SetFontFamilyCommand({
        pageIndex: 0,
        runId: run.id,
        nextFamily: "Times-Roman",
      }),
      { pageIndex: 0, runId: run.id },
    ),
  );

  expect(isFauxItalic(run)).toBe(true);
  for (const slant of memberSlants(store, run))
    expect(slant).toBeCloseTo(FAUX_ITALIC_SLANT, 3);
  store.undo();
  for (const slant of memberSlants(store, run))
    expect(slant).toBeCloseTo(FAUX_ITALIC_SLANT, 3);
});

function typeMore(store: EditorStore, run: TextRun, keep: boolean) {
  const edit = new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `${run.text} more`,
  });
  store.dispatch(
    keep ? new KeepObliqueCommand(edit, { pageIndex: 0, runId: run.id }) : edit,
  );
  expect(run.text.endsWith(" more")).toBe(true);
  expect(memberSlants(store, run).length).toBeGreaterThan(1);
  return memberSlants(store, run);
}

test("an edit kept oblique leans the text it added", async () => {
  const store = await fixture("subset-font-sample.pdf");
  for (const slant of typeMore(store, lean(store), true))
    expect(slant).toBeCloseTo(FAUX_ITALIC_SLANT, 3);
});

test("text typed into a leaned run leans with it", async () => {
  const store = await fixture("subset-font-sample.pdf");
  for (const slant of typeMore(store, lean(store), false))
    expect(slant).toBeCloseTo(FAUX_ITALIC_SLANT, 3);
});

function appendInOwnFont(store: EditorStore, oneKeyAtATime: boolean) {
  const run = firstRun(store);
  const m = store.document!.module;
  const own = new Set(collectMemberPtrs(run));
  const ownFont = m.FPDFTextObj_GetFont([...own][0]);
  const base = run.text;
  const typed = " and more";
  for (let n = oneKeyAtATime ? 1 : typed.length; n <= typed.length; n++)
    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: base + typed.slice(0, n),
      }),
    );
  expect(run.text).toBe(base + typed);
  const added = [...new Set(collectMemberPtrs(run))].filter(
    (ptr) => !own.has(ptr),
  );
  expect(added.length).toBeGreaterThan(0);
  for (const ptr of added) expect(m.FPDFTextObj_GetFont(ptr)).toBe(ownFont);
  return added.map((ptr) => readMatrix(m, ptr)![4]);
}

for (const oneKeyAtATime of [false, true])
  test(`text added to a leaned run ${oneKeyAtATime ? "one key at a time " : ""}keeps the run's own font and the upright advances`, async () => {
    const upright = appendInOwnFont(
      await fixture("subset-font-sample.pdf"),
      oneKeyAtATime,
    );
    const store = await fixture("subset-font-sample.pdf");
    lean(store);
    const leaned = appendInOwnFont(store, oneKeyAtATime);

    expect(leaned).toHaveLength(upright.length);
    leaned.forEach((x, i) =>
      expect(Math.abs(x - upright[i])).toBeLessThan(0.1),
    );
  });

test("a leaned run wrapped to a narrower width stays leaned", async () => {
  const store = await fixture("subset-font-sample.pdf");
  const run = lean(store);
  const text = run.text;
  store.dispatch(
    new ReflowWrapCommand({
      pageIndex: 0,
      runId: run.id,
      maxWidthPt: run.bounds.width / 2,
    }),
  );

  expect(run.text.replace(/\s+/g, " ")).toBe(text);
  expect(run.text.split("\n").length).toBeGreaterThan(1);
  expect(isFauxItalic(run)).toBe(true);
  for (const slant of memberSlants(store, run))
    expect(slant).toBeCloseTo(FAUX_ITALIC_SLANT, 3);
});

test("a save keeps the glyphs leaned", async () => {
  const store = await fixture("subset-font-sample.pdf");
  const text = lean(store).text;

  const saved = await storeWith(await savedBytes(store));
  const reopened = saved.document!.page(0).runs.find((r) => r.text === text)!;

  expect(isFauxItalic(reopened)).toBe(true);
  for (const slant of memberSlants(saved, reopened))
    expect(slant).toBeCloseTo(FAUX_ITALIC_SLANT, 3);
});
