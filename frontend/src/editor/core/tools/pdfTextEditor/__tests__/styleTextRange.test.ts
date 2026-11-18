import { act, renderHook } from "@testing-library/react";
import { beforeAll, expect, test, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import {
  useSelectionActions,
  type FontPickFailure,
} from "@editor/tools/pdfTextEditor/hooks/useSelectionActions";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  collectMemberPtrs,
  drawnEndPt,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { readTextSource } from "@editor/tools/pdfTextEditor/commands/textPieces";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import {
  editorStores,
  savedBytes,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

const FPDF_PAGEOBJ_TEXT = 1;
const REVENUE = "Revenue grew in every region this quarter,";

servePdfiumWasm();
const { storeWith, fixture } = editorStores();

beforeAll(() => {
  get.mockRejectedValue(new Error("no server fonts"));
  // jsdom has no canvas; text measurement falls back without one.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

function runStarting(store: EditorStore, text: string): TextRun {
  const run = store.document!.page(0).runs.find((r) => r.text.startsWith(text));
  expect(run, `no run starting "${text}"`).toBeTruthy();
  return run!;
}

interface Drawn {
  text: string;
  font: string;
  x: number;
  right: number;
}

/** Each object of the run with the text it draws, its /BaseFont and where its ink starts and ends. */
function drawn(store: EditorStore, run: TextRun): Drawn[] {
  const doc = store.document!;
  const m = doc.module;
  const page = doc.page(0);
  const buf = m.pdfium.wasmExports.malloc(2048);
  const name = m.pdfium.wasmExports.malloc(256);
  const box = m.pdfium.wasmExports.malloc(16);
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  try {
    return collectMemberPtrs(run)
      .filter((ptr) => ptr && m.FPDFPageObj_GetType(ptr) === FPDF_PAGEOBJ_TEXT)
      .map((ptr) => {
        m.FPDFTextObj_GetText(ptr, textPage, buf, 2048);
        m.FPDFFont_GetBaseFontName(m.FPDFTextObj_GetFont(ptr), name, 256);
        m.FPDFPageObj_GetBounds(ptr, box, box + 4, box + 8, box + 12);
        return {
          text: m.pdfium.UTF16ToString(buf).trim(),
          font: m.pdfium.UTF8ToString(name).replace(/^[A-Z]{6}\+/, ""),
          x: m.pdfium.getValue(box, "float"),
          right: m.pdfium.getValue(box + 8, "float"),
        };
      });
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(buf);
    m.pdfium.wasmExports.free(name);
    m.pdfium.wasmExports.free(box);
  }
}

/** The run's words as "text@Font", objects split at spaces. */
function faces(store: EditorStore, run: TextRun): string[] {
  return drawn(store, run).flatMap((piece) =>
    piece.text.split(/\s+/).map((word) => `${word}@${piece.font}`),
  );
}

function wordsIn(store: EditorStore, run: TextRun, font: string): string[] {
  return faces(store, run)
    .filter((face) => face.endsWith(`@${font}`))
    .map((face) => face.split("@")[0]);
}

function pageText(store: EditorStore): string {
  const doc = store.document!;
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const count = m.FPDFText_CountChars(textPage);
  const buf = m.pdfium.wasmExports.malloc((count + 1) * 2);
  try {
    m.FPDFText_GetText(textPage, 0, count, buf);
    return m.pdfium.UTF16ToString(buf);
  } finally {
    m.pdfium.wasmExports.free(buf);
    m.FPDFText_ClosePage(textPage);
  }
}

/** Where the engine puts the first letter of `needle` on the page, from the page's own text. */
function originOf(store: EditorStore, needle: string): number {
  const at = pageText(store).indexOf(needle);
  expect(at, `"${needle}" is not on the page`).toBeGreaterThanOrEqual(0);
  const doc = store.document!;
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(doc.page(0).pagePtr);
  const xy = m.pdfium.wasmExports.malloc(16);
  try {
    m.FPDFText_GetCharOrigin(textPage, at, xy, xy + 8);
    return m.pdfium.getValue(xy, "double");
  } finally {
    m.pdfium.wasmExports.free(xy);
    m.FPDFText_ClosePage(textPage);
  }
}

/**
 * The objects of `run` that together draw `word`, in order, and for each after
 * the first how far it starts from where the one before it left the pen.
 */
function seamsIn(store: EditorStore, run: TextRun, word: string): number[] {
  const m = store.document!.module;
  const objects = drawn(store, run).flatMap((piece, i) => {
    const ptr = collectMemberPtrs(run).filter(
      (p) => p && m.FPDFPageObj_GetType(p) === FPDF_PAGEOBJ_TEXT,
    )[i];
    const source = readTextSource(m, ptr);
    return source && piece.text ? [{ ...piece, ptr, source }] : [];
  });
  objects.sort((a, b) => a.source.matrix[4] - b.source.matrix[4]);
  for (let first = 0; first < objects.length; first++) {
    let spelled = "";
    for (let last = first; last < objects.length; last++) {
      spelled += objects[last].text;
      if (!word.startsWith(spelled)) break;
      if (spelled !== word) continue;
      return objects.slice(first + 1, last + 1).map((piece, k) => {
        const before = objects[first + k];
        const penEnd = drawnEndPt(
          m,
          [before.ptr],
          [before.text],
          before.source.size,
        );
        return piece.source.matrix[4] - penEnd - run.charSpacingPt;
      });
    }
  }
  throw new Error(`no objects of the run spell "${word}"`);
}

function selectText(store: EditorStore, run: TextRun, part: string): void {
  const start = run.text.indexOf(part);
  expect(start, `"${part}" is not in the run`).toBeGreaterThanOrEqual(0);
  store.selection.selectOne(run.id);
  store.selection.setTextRange(run.id, { start, end: start + part.length });
}

async function perform(
  store: EditorStore,
  action: (
    actions: ReturnType<typeof useSelectionActions>,
  ) => Promise<FontPickFailure | null>,
): Promise<FontPickFailure | null> {
  const { result } = renderHook(() => useSelectionActions(store));
  let failure: FontPickFailure | null = null;
  await act(async () => {
    failure = await action(result.current);
  });
  return failure;
}

test("Bold on one word mid-line bolds that word only and moves the rest of the line by the width it gains", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  const before = {
    grew: originOf(store, "grew"),
    every: originOf(store, "every"),
    region: originOf(store, "region"),
    led: originOf(store, "led by"),
  };
  selectText(store, run, "every");

  expect(await perform(store, (a) => a.toggleBold())).toBeNull();

  expect(wordsIn(store, run, "Helvetica-Bold")).toEqual(["every"]);
  expect(originOf(store, "grew")).toBeCloseTo(before.grew, 1);
  expect(originOf(store, "every")).toBeCloseTo(before.every, 1);
  // Helvetica-Bold "every" is about 1.6pt wider than the regular cut at this size.
  const moved = originOf(store, "region") - before.region;
  expect(moved).toBeGreaterThan(0.5);
  expect(moved).toBeLessThan(4);
  expect(originOf(store, "led by")).toBeCloseTo(before.led, 1);
  expect(run.text).toBe(`${REVENUE}\nled by demand for the new product line.`);
});

test("Italic on a range across a word boundary slants exactly those letters", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  const ew = originOf(store, "ew in");
  selectText(store, run, "ew in ev");

  expect(await perform(store, (a) => a.toggleItalic())).toBeNull();

  const pieces = drawn(store, run).filter((p) => p.text);
  expect(
    pieces.filter((p) => p.font === "Helvetica-Oblique").map((p) => p.text),
  ).toEqual(["ew", "in", "ev"]);
  expect(pieces.find((p) => p.text === "gr")?.font).toBe("Helvetica");
  expect(pieces.find((p) => p.text === "ery")?.font).toBe("Helvetica");
  // One word, so the slanted half starts where the upright half ends.
  expect(Math.abs(originOf(store, "ew in") - ew)).toBeLessThan(0.3);
});

test("Bold on the first word of a line toggles off again", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  selectText(store, run, "Revenue");

  await perform(store, (a) => a.toggleBold());
  expect(wordsIn(store, run, "Helvetica-Bold")).toEqual(["Revenue"]);
  await perform(store, (a) => a.toggleBold());

  expect(wordsIn(store, run, "Helvetica-Bold")).toEqual([]);
  expect(pageText(store)).toContain(REVENUE);
});

test("a weight picked for part of a line applies to that part only", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  selectText(store, run, "region");

  expect(await perform(store, (a) => a.changeFontWeight(700))).toBeNull();

  expect(wordsIn(store, run, "Helvetica-Bold")).toEqual(["region"]);
});

test("a family picked for part of a line redraws that part in the family, keeping its style", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  selectText(store, run, "every region");

  expect(await perform(store, (a) => a.changeFontFamily("Times-Roman"))).toBe(
    null,
  );

  expect(wordsIn(store, run, "Times-Roman")).toEqual(["every", "region"]);
  expect(wordsIn(store, run, "Helvetica")).toContain("quarter,");
});

test("undo puts the line back exactly and redo restyles it again", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  const before = drawn(store, run);
  selectText(store, run, "every");
  await perform(store, (a) => a.toggleBold());
  const after = drawn(store, run);
  expect(wordsIn(store, run, "Helvetica-Bold")).toEqual(["every"]);

  store.undo();
  expect(drawn(store, run)).toEqual(before);
  expect(pageText(store)).toContain(REVENUE);

  store.redo();
  expect(drawn(store, run)).toEqual(after);
  store.undo();
  store.redo();
  expect(drawn(store, run)).toEqual(after);
});

test("a save keeps the styled word in its own face and the line in reading order", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  selectText(store, run, "every");
  await perform(store, (a) => a.toggleBold());

  const reopened = await storeWith(await savedBytes(store));
  const saved = runStarting(reopened, "Revenue grew");
  expect(wordsIn(reopened, saved, "Helvetica-Bold")).toEqual(["every"]);
  expect(pageText(reopened)).toContain(REVENUE);
  expect(saved.text.split("\n")[0]).toBe(REVENUE);
});

test("a range spanning two lines of a paragraph restyles both parts and leaves the other lines alone", async () => {
  const store = await fixture("paragraph-sample.pdf");
  const run = runStarting(store, "First line of the body");
  const lines = run.text.split("\n");
  const third = drawn(store, run).find((p) =>
    p.text.startsWith("left margin"),
  )!;
  selectText(store, run, "together.\nSecond line");

  expect(await perform(store, (a) => a.toggleBold())).toBeNull();

  expect(wordsIn(store, run, "Helvetica-Bold")).toEqual([
    "together.",
    "Second",
    "line",
  ]);
  expect(run.text.split("\n")).toEqual(lines);
  expect(
    drawn(store, run).find((p) => p.text.startsWith("left margin")),
  ).toEqual(third);
  expect(pageText(store)).toContain("grouped together.");
});

test("letters the bold subset lacks stay in the regular face and the user is told", async () => {
  const store = await fixture("mushroom-life.pdf");
  const run = runStarting(store, "Mushrooms represent");
  selectText(store, run, "unique");

  expect(await perform(store, (a) => a.toggleBold())).toBe("closestMatch");

  const bold = wordsIn(store, run, "LMRoman12-Bold").join("");
  expect(bold.length).toBeGreaterThan(0);
  expect(bold).toBe("uniue");
  expect(
    faces(store, run)
      .map((face) => face.split("@")[0])
      .join(""),
  ).toContain("unique");
  expect(run.text).toContain("a unique posi-");
});

test.each([
  [
    "before its last letter",
    "represent one of nature’s",
    "nature’s",
    "of nature’s most",
  ],
  ["mid-word", "unique", "unique", "a unique posi"],
  [
    "at the start of a word",
    "biological",
    "biological",
    "the biological world",
  ],
])(
  "a letter the bold subset lacks %s abuts the letters around it and reads as one word, on the page and after a save",
  async (_where, part, word, reads) => {
    const store = await fixture("mushroom-life.pdf");
    const run = runStarting(store, "Mushrooms represent");
    selectText(store, run, part);

    expect(await perform(store, (a) => a.toggleBold())).toBe("closestMatch");

    const seams = seamsIn(store, run, word);
    expect(seams.length).toBeGreaterThan(0);
    for (const seam of seams) expect(Math.abs(seam)).toBeLessThan(0.01);
    expect(pageText(store)).toContain(reads);
    const reopened = await storeWith(await savedBytes(store));
    expect(pageText(reopened)).toContain(reads);
  },
);

test("typing straight after a bolded word goes on in bold", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  selectText(store, run, "every");
  await perform(store, (a) => a.toggleBold());

  const at = run.text.indexOf("every") + "every".length;
  store.dispatch(
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: `${run.text.slice(0, at)}one${run.text.slice(at)}`,
    }),
  );

  expect(wordsIn(store, run, "Helvetica-Bold")).toEqual(["every", "one"]);
  expect(pageText(store)).toContain("in everyone region");
  expect(wordsIn(store, run, "Helvetica")).toContain("region");
});

test("right-to-left text refuses a change to part of its line and stays as drawn", async () => {
  const store = await fixture("coloured-word-sample.pdf");
  const run = runStarting(store, "הטלפון");
  const before = drawn(store, run);
  selectText(store, run, "שלום");

  expect(await perform(store, (a) => a.toggleBold())).toBeNull();

  expect(store.getState().error).toMatch(/right-to-left/);
  expect(drawn(store, run)).toEqual(before);
  expect(store.history.canUndo).toBe(false);
});

test("text that needs shaping refuses a change to part of it", async () => {
  const store = await fixture("shaped-line-sample.pdf");
  const run = store.document!.page(0).runs[0];
  const before = drawn(store, run);
  store.selection.selectOne(run.id);
  store.selection.setTextRange(run.id, { start: 0, end: 3 });

  expect(await perform(store, (a) => a.changeFontFamily("Times-Roman"))).toBe(
    "needsShaping",
  );
  expect(drawn(store, run)).toEqual(before);
});

test("in a wrapped box a change rewraps the paragraph only when a line would overflow", async () => {
  const store = await fixture("paragraph-sample.pdf");
  store.setWidthMode("wrap");
  const run = runStarting(store, "First line of the body");
  const text = run.text;
  selectText(store, run, "bottom");
  await perform(store, (a) => a.toggleBold());
  expect(run.text).toBe(text);

  selectText(store, run, "Second line continues the paragraph and shares");
  await perform(store, (a) => a.toggleBold());
  expect(run.text).not.toBe(text);
  expect(run.text.replace(/\s+/g, " ")).toBe(text.replace(/\s+/g, " "));

  store.undo();
  expect(run.text).toBe(text);
});

test("with the whole box's text selected Bold applies to the box as before", async () => {
  const store = await fixture("tagged-sample.pdf");
  const run = runStarting(store, "Revenue grew");
  store.selection.selectOne(run.id);
  store.selection.setTextRange(run.id, { start: 0, end: run.text.length });

  await perform(store, (a) => a.toggleBold());

  const live = runStarting(store, "Revenue grew");
  expect(new Set(drawn(store, live).map((p) => p.font))).toEqual(
    new Set(["Helvetica-Bold"]),
  );
});
