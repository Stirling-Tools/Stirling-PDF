// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { resetCmapCache } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";
import { resetContentStreamCache } from "@editor/tools/pdfTextEditor/charcode/ContentStreamResolver";
import { resetFontHelperCaches } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import { lettersWithoutGlyph } from "@editor/tools/pdfTextEditor/charcode/fontGlyphs";
import { RolledBackError } from "@editor/tools/pdfTextEditor/commands/Command";
import { DuplicateRunCommand } from "@editor/tools/pdfTextEditor/commands/DuplicateRunCommand";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import {
  _clearDroppedBase14CharsForTests,
  getDroppedBase14Chars,
  resetCharCoverageCache,
  resetOnPageAdvCache,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  HistoryStack,
  HistoryStepError,
} from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { needsShaping } from "@editor/tools/pdfTextEditor/util/complexShaping";
import {
  emitDeviceFontTextObject,
  loadDeviceFontInto,
  resetDeviceFontEmbedCache,
} from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import {
  resetFontCompletions,
  setClosestFont,
} from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { registerFontBytes } from "@editor/tools/pdfTextEditor/util/localFonts";
import { FONT_DIR } from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const BLACK = { r: 0, g: 0, b: 0, a: 255 };
const DEVANAGARI = "Noto Sans Devanagari";
const OTHER_DEVANAGARI = "Second Devanagari";
const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith(".wasm")
        ? new Response(wasm, {
            headers: { "Content-Type": "application/wasm" },
          })
        : new Response(null, { status: 404 }),
    ),
  );
  for (const [family, file] of [
    [DEVANAGARI, "NotoSansDevanagari-Regular.ttf"],
    [OTHER_DEVANAGARI, "NotoSansDevanagari-Regular.ttf"],
    ["Noto Sans", "NotoSans-Regular.ttf"],
    ["Noto Sans Hebrew", "NotoSansHebrew-Regular.ttf"],
    ["Liberation Sans", "LiberationSans-Regular.ttf"],
  ])
    registerFontBytes(
      family,
      new Uint8Array(await readFile(path.join(FONT_DIR, file))),
    );
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
  // Keyed by font and page pointers, which the next document reuses.
  resetCharCoverageCache();
  resetContentStreamCache();
  resetCmapCache();
  resetFontHelperCaches();
  resetOnPageAdvCache();
  resetDeviceFontEmbedCache();
  resetFontCompletions();
  _clearDroppedBase14CharsForTests();
});

afterAll(() => vi.unstubAllGlobals());

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

const sample = async () =>
  open(new Uint8Array(await readFile(path.join(FIXTURES, "sample.pdf"))));

const saved = async (doc: EditorDocument) =>
  open(new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()));

const pageText = (doc: EditorDocument) =>
  doc
    .page(0)
    .runs.map((run) => run.text)
    .join("\n");

/** A document holding `text` drawn straight from its code points, as another producer could have written it. */
async function withLine(text: string): Promise<EditorDocument> {
  const doc = await sample();
  const page = doc.page(0);
  expect(
    emitDeviceFontTextObject(doc, page, DEVANAGARI, text, 24, BLACK, 60, 120),
  ).not.toBe(0);
  page.markDirty();
  page.markNeedsGenerate();
  return saved(doc);
}

test.each([
  ["Noto Sans", "́"],
  ["Noto Sans Hebrew", "ְ"],
  [DEVANAGARI, "े"],
])("draws a combining mark %s has, on its own", async (family, mark) => {
  const doc = await sample();

  expect(
    emitDeviceFontTextObject(doc, doc.page(0), family, mark, 24, BLACK, 60, 60),
  ).not.toBe(0);
  expect(
    lettersWithoutGlyph(doc.module, loadDeviceFontInto(doc, family), mark),
  ).toEqual([]);
});

test("still refuses a combining mark the face does not have", async () => {
  const doc = await sample();

  expect(
    emitDeviceFontTextObject(
      doc,
      doc.page(0),
      "Liberation Sans",
      "ְ",
      24,
      BLACK,
      60,
      60,
    ),
  ).toBe(0);
});

test.each([
  ["Latin with a combining accent", "café", false],
  ["Greek", "Καλημέρα", false],
  ["Cyrillic", "Привет", false],
  ["Hebrew with niqqud", "שָׁלוֹם", false],
  ["Arabic with harakat", "مَرْحَبًا", false],
  ["Thai with single marks", "สวัสดี น้ำ", false],
  ["Thai with a tone mark stacked on a vowel", "ที่", true],
  ["Thai with a mark on a tall consonant", "ปั๊ม", true],
  ["Devanagari with signs drawn in place", "नमस भारत कौन", false],
  ["a Devanagari conjunct", "नमस्ते", true],
  ["a Devanagari pre-base vowel sign", "किताब", true],
  ["a Devanagari sign above", "नमे", true],
  ["a Malayalam pre-base vowel sign", "കേരളം", true],
  ["a Tibetan stack", "བཀྲ", true],
  ["Syriac", "ܫܠܡܐ", true],
])("%s: needs shaping is %j", (_, text, expected) => {
  expect(needsShaping(text)).toBe(expected);
});

test("refuses typing a Devanagari conjunct and leaves the line as it was", async () => {
  const doc = await sample();
  const page = doc.page(0);
  const run = page.runs[0];
  setClosestFont(run.fontId, DEVANAGARI);
  const before = run.text;

  const edit = new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: "नमस्ते",
  });

  expect(() => edit.apply(doc)).toThrow(RolledBackError);
  expect(run.text).toBe(before);
  expect(getDroppedBase14Chars()).toEqual([]);
  expect(pageText(await saved(doc))).toContain(before.trim());
});

test("refuses typing a Devanagari conjunct when no face for it is loaded", async () => {
  const doc = await sample();
  const run = doc.page(0).runs[0];
  const before = run.text;

  const edit = new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `${before}नमस्ते`,
  });

  expect(() => edit.apply(doc)).toThrow(RolledBackError);
  expect(run.text).toBe(before);
  expect(getDroppedBase14Chars()).toEqual([]);
});

test("refuses a deletion that would redraw the rest of a conjunct", async () => {
  const doc = await withLine("नमस्ते");
  const page = doc.page(0);
  const run = page.runs.find((r) => r.text.includes("नमस्ते"))!;
  const before = run.text;
  const objects = doc.module.FPDFPage_CountObjects(page.pagePtr);

  const edit = new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: before.replace("नमस्ते", "नमस्त"),
  });

  expect(() => edit.apply(doc)).toThrow(RolledBackError);
  expect(run.text).toBe(before);
  expect(doc.module.FPDFPage_CountObjects(page.pagePtr)).toBe(objects);
  expect(pageText(await saved(doc))).toContain("नमस्ते");
});

test("an edit beside a conjunct the page already draws keeps it, through undo and redo", async () => {
  const doc = await withLine("नमस्ते");
  const page = doc.page(0);
  const run = page.runs.find((r) => r.text.includes("नमस्ते"))!;
  const before = run.text;
  const history = new HistoryStack();

  try {
    history.execute(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: `${before} ok`,
      }),
      doc,
    );
  } catch (err) {
    expect(err).toBeInstanceOf(HistoryStepError);
    expect((err as HistoryStepError).documentIntact).toBe(true);
    expect(run.text).toBe(before);
    return;
  }
  expect(run.text).toBe(`${before} ok`);
  history.undo(doc);
  expect(run.text).toBe(before);
  history.redo(doc);
  expect(run.text).toBe(`${before} ok`);
  const text = pageText(await saved(doc));
  expect(text).toContain("नमस्ते");
  expect(text).toContain("ok");
});

test("refuses a Thai tone mark typed onto a vowel sign", async () => {
  const doc = await sample();
  const run = doc.page(0).runs[0];
  const before = run.text;

  const edit = new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `${before}ที่`,
  });
  const typed = new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `${before}ที`,
  });

  expect(() => edit.apply(doc)).toThrow(RolledBackError);
  typed.apply(doc);
  expect(() =>
    new EditTextCommand({
      pageIndex: 0,
      runId: run.id,
      nextText: `${before}ที่`,
    }).apply(doc),
  ).toThrow(RolledBackError);
  expect(run.text).toBe(`${before}ที`);
});

test("still draws Devanagari whose signs need no shaping", async () => {
  const doc = await sample();
  const run = doc.page(0).runs[0];
  setClosestFont(run.fontId, DEVANAGARI);

  new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: "नमस भारत",
  }).apply(doc);

  expect(run.text).toBe("नमस भारत");
  expect(getDroppedBase14Chars()).toEqual([]);
  expect(pageText(await saved(doc))).toContain("नमस भारत");
});

test("refuses a font change that would redraw a conjunct", async () => {
  const doc = await withLine("नमस्ते");
  const page = doc.page(0);
  const run = page.runs.find((r) => r.text.includes("नमस्ते"))!;
  const fontId = run.fontId;
  const objects = doc.module.FPDFPage_CountObjects(page.pagePtr);

  new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: OTHER_DEVANAGARI,
  }).apply(doc);

  expect(run.fontId).toBe(fontId);
  expect(doc.module.FPDFPage_CountObjects(page.pagePtr)).toBe(objects);
});

test("refuses a copy that would redraw a conjunct", async () => {
  const doc = await withLine("नमस्ते");
  const page = doc.page(0);
  const run = page.runs.find((r) => r.text.includes("नमस्ते"))!;
  const runs = page.runs.length;

  const copy = new DuplicateRunCommand({ pageIndex: 0, runId: run.id });

  expect(() => copy.apply(doc)).toThrow(RolledBackError);
  expect(copy.insertedRunId).toBeNull();
  expect(page.runs).toHaveLength(runs);
});
