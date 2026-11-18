// @vitest-environment node
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@editor/services/apiClient", () => ({ default: { get } }));

import { resetCmapCache } from "@editor/tools/pdfTextEditor/charcode/CmapResolver";
import { resetContentStreamCache } from "@editor/tools/pdfTextEditor/charcode/ContentStreamResolver";
import { resetFontHelperCaches } from "@editor/tools/pdfTextEditor/charcode/FontHelpers";
import { DuplicateRunCommand } from "@editor/tools/pdfTextEditor/commands/DuplicateRunCommand";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  _clearDroppedBase14CharsForTests,
  getDroppedBase14Chars,
  readObjTexts,
  resetCharCoverageCache,
  resetOnPageAdvCache,
  resetPerCharBranchPtrs,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  emitDeviceFontTextObject,
  familyCoverage,
} from "@editor/tools/pdfTextEditor/util/deviceFontEmbed";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { setClosestFont } from "@editor/tools/pdfTextEditor/util/documentFontCompletion";
import {
  isItalicFont,
  resetDocumentFontStyles,
} from "@editor/tools/pdfTextEditor/util/documentFontStyle";
import { loadExternalFontBytes } from "@editor/tools/pdfTextEditor/util/externalFonts";
import {
  SERVER_FONTS_URL,
  forgetServerFontList,
  loadServerFonts,
} from "@editor/tools/pdfTextEditor/util/serverFonts";
import { FONT_DIR } from "@editor/tools/pdfTextEditor/__tests__/scanFixtures";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const SERVED = [
  ["Liberation Sans", "LiberationSans-Regular.ttf"],
  ["Liberation Serif", "LiberationSerif-Regular.ttf"],
] as const;
const faceId = (i: number) => (i + 1).toString(16).padStart(64, "0");
const opened: EditorDocument[] = [];
let wasm: Buffer<ArrayBuffer>;

let served: ReadonlyArray<readonly [string, string]> = SERVED;

function serveFonts(): void {
  get.mockImplementation(async (url: string) => {
    if (url === SERVER_FONTS_URL)
      return {
        data: {
          families: served.map(([family, file], i) => ({
            family,
            faces: [
              {
                id: faceId(i),
                style: "Regular",
                bold: false,
                italic: false,
                weight: 400,
                postscriptName: file.replace(".ttf", ""),
              },
            ],
          })),
        },
      };
    const index = served.findIndex((_, i) => url.endsWith(faceId(i)));
    if (index >= 0)
      return {
        data: new Uint8Array(
          readFileSync(path.join(FONT_DIR, served[index][1])),
        ).buffer,
      };
    throw new Error("unavailable");
  });
}

beforeAll(async () => {
  wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
});

beforeEach(async () => {
  served = SERVED;
  get.mockReset();
  forgetServerFontList();
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
  serveFonts();
  await loadServerFonts();
  for (const [family] of SERVED) await loadExternalFontBytes(family);
  _clearDroppedBase14CharsForTests();
  resetDocumentFontStyles();
});

afterEach(() => {
  // Font and page handles are reused by the next document opened; the editor resets these when it loads one.
  resetCharCoverageCache();
  resetContentStreamCache();
  resetCmapCache();
  resetFontHelperCaches();
  resetOnPageAdvCache();
  resetPerCharBranchPtrs();
  for (const doc of opened.splice(0)) doc.dispose();
  forgetServerFontList();
});

afterAll(() => vi.unstubAllGlobals());

async function open(name: string): Promise<EditorDocument> {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(path.join(FIXTURES, name))),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

function fontNameOf(doc: EditorDocument, ptr: number): string {
  const m = doc.module;
  const name = m.pdfium.wasmExports.malloc(256);
  try {
    m.FPDFFont_GetBaseFontName(m.FPDFTextObj_GetFont(ptr), name, 256);
    return m.pdfium.UTF8ToString(name).replace(/^[A-Z]{6}\+/, "");
  } finally {
    m.pdfium.wasmExports.free(name);
  }
}

test("duplicates a line whose missing letters come from a served lookalike", async () => {
  const doc = await open("subset-font-sample.pdf");
  const page = doc.page(0);
  const run = page.runs[0];
  setClosestFont(run.fontId, "Liberation Sans");
  const before = page.runs.length;

  const cmd = new DuplicateRunCommand({ pageIndex: 0, runId: run.id });
  cmd.apply(doc);

  expect(page.runs).toHaveLength(before + 1);
  const copy = page.findRun(cmd.insertedRunId!)!;
  expect(copy.text).toBe(run.text);
  expect(fontNameOf(doc, copy.pdfiumObjPtr)).toBe("LiberationSans");

  cmd.revert(doc);
  expect(page.runs).toHaveLength(before);
});

test("goes on drawing a typed word in its served lookalike as more of it is typed", async () => {
  const doc = await open("mushroom-life.pdf");
  const run = doc.page(0).runs.find((r) => r.text === "Spore Stage")!;
  setClosestFont(run.fontId, "Liberation Serif");

  for (const nextText of ["Z Stage", "Zq Stage"])
    new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }).apply(doc);

  expect(fontNameOf(doc, run.pdfiumObjPtr)).toBe("LiberationSerif");
});

test("redo keeps a served font after the server's font list is reloaded", async () => {
  const doc = await open("subset-font-sample.pdf");
  const run = doc.page(0).runs[0];
  const cmd = new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: "Liberation Serif",
  });
  cmd.apply(doc);
  expect(fontNameOf(doc, run.pdfiumObjPtr)).toBe("LiberationSerif");

  cmd.revert(doc);
  forgetServerFontList();
  cmd.apply(doc);

  expect(fontNameOf(doc, run.pdfiumObjPtr)).toBe("LiberationSerif");
});

test("redo keeps the face a font change drew in after another server offers a different one", async () => {
  const doc = await open("subset-font-sample.pdf");
  const run = doc.page(0).runs[0];
  const cmd = new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: "Liberation Serif",
  });
  cmd.apply(doc);
  cmd.revert(doc);

  served = [["Liberation Serif", "LiberationSerif-Bold.ttf"]];
  forgetServerFontList();
  await loadServerFonts();
  await loadExternalFontBytes("Liberation Serif");
  cmd.apply(doc);

  expect(fontNameOf(doc, run.pdfiumObjPtr)).toBe("LiberationSerif");
});

test("checks typed letters against the face the document holds, not a newer one of the same name", async () => {
  const doc = await open("subset-font-sample.pdf");
  const page = doc.page(0);
  const black = { r: 0, g: 0, b: 0, a: 255 };
  const draw = (text: string) =>
    emitDeviceFontTextObject(
      doc,
      page,
      "Liberation Serif",
      text,
      12,
      black,
      40,
      40,
    );
  expect(draw("Latin")).not.toBe(0);

  served = [["Liberation Serif", "NotoSansJP-Regular.ttf"]];
  forgetServerFontList();
  await loadServerFonts();
  await loadExternalFontBytes("Liberation Serif");
  expect(familyCoverage(null, "Liberation Serif")?.(0x6f22)).toBe(true);

  expect(draw("漢字")).toBe(0);
});

test("a duplicated right-to-left line is drawn in the same direction as the original", async () => {
  served = [["Noto Sans Hebrew", "NotoSansHebrew-Regular.ttf"]];
  forgetServerFontList();
  await loadServerFonts();
  await loadExternalFontBytes("Noto Sans Hebrew");
  const doc = await open("rtl-sample.pdf");
  const page = doc.page(0);
  const run = page.runs.find((r) => /^[\u0590-\u05ff ]+$/.test(r.text))!;
  setClosestFont(run.fontId, "Noto Sans Hebrew");

  const cmd = new DuplicateRunCommand({ pageIndex: 0, runId: run.id });
  cmd.apply(doc);

  const saved = await EditorDocument.open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  opened.push(saved);
  PdfiumTextReader.populate(saved, saved.page(0));
  const squash = (text: string) => text.replace(/\s+/g, "");
  const lines = saved
    .page(0)
    .runs.flatMap((r) => r.text.split("\n"))
    .filter((line) => /^[\u0590-\u05ff ]+$/.test(line));
  expect(lines.map(squash)).toEqual([squash(run.text), squash(run.text)]);
});

/** What the run's objects draw, each as "font|text", in the order the run holds them. */
function drawn(doc: EditorDocument, run: TextRun): string[] {
  const ptrs = [
    ...new Set(
      [
        ...run.paragraphLeafPtrs,
        ...run.mergedFromPtrs,
        run.pdfiumObjPtr,
      ].filter(Boolean),
    ),
  ];
  const texts = readObjTexts(doc.module, doc.page(0).pagePtr, ptrs);
  return ptrs.map((ptr, i) => `${fontNameOf(doc, ptr)}|${texts[i]?.trim()}`);
}

/** The page's objects in content order, which PDFium's reading of each object's text depends on. */
function contentOrder(doc: EditorDocument): number[] {
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;
  return Array.from({ length: m.FPDFPage_CountObjects(pagePtr) }, (_, i) =>
    m.FPDFPage_GetObject(pagePtr, i),
  );
}

const letters = (text: string) => [...text.replace(/\s+/g, "")].sort().join("");
const lettersDrawn = (pieces: string[]) =>
  letters(pieces.map((piece) => piece.slice(piece.indexOf("|") + 1)).join(""));

async function savedText(doc: EditorDocument): Promise<string> {
  const saved = await EditorDocument.open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  opened.push(saved);
  PdfiumTextReader.populate(saved, saved.page(0));
  return saved
    .page(0)
    .runs.map((r) => r.text)
    .join("\n");
}

test.each(["Liberation Serif", "Times-Roman"])(
  "a letter %s lacks stays in the font that drew it",
  async (family) => {
    const doc = await open("mixed-style-sample.pdf");
    const run = doc.page(0).runs.find((r) => r.text.includes("✓"))!;
    const before = { fontId: run.fontId, drawn: drawn(doc, run) };
    const tick = before.drawn.find((piece) => piece.endsWith("|✓"))!;
    const cmd = new SetFontFamilyCommand({
      pageIndex: 0,
      runId: run.id,
      nextFamily: family,
    });

    expect(cmd.wouldLoseText(doc)).toBe(false);
    expect(drawn(doc, run)).toEqual(before.drawn);

    cmd.apply(doc);
    const after = { fontId: run.fontId, drawn: drawn(doc, run) };
    expect(lettersDrawn(after.drawn)).toBe(letters(run.text));
    expect(after.drawn).toContain(tick);
    expect(fontNameOf(doc, run.pdfiumObjPtr)).toBe(family.replace(/\s/g, ""));
    expect(after.fontId).not.toBe(before.fontId);
    expect(getDroppedBase14Chars()).toEqual([]);
    expect(await savedText(doc)).toContain("✓");

    cmd.revert(doc);
    expect({ fontId: run.fontId, drawn: drawn(doc, run) }).toEqual(before);

    cmd.apply(doc);
    expect({ fontId: run.fontId, drawn: drawn(doc, run) }).toEqual(after);
  },
);

test("a letter kept in its own font survives typing elsewhere in the paragraph", async () => {
  const doc = await open("mixed-style-sample.pdf");
  const run = doc.page(0).runs.find((r) => r.text.includes("✓"))!;
  new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: "Liberation Serif",
  }).apply(doc);
  const tick = drawn(doc, run).find((piece) => piece.endsWith("|✓"))!;

  const edit = new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `${run.text.slice(0, 3)}Zq${run.text.slice(3)}`,
  });
  edit.apply(doc);

  const pieces = drawn(doc, run);
  expect(pieces).toContain(tick);
  expect(pieces.filter((piece) => piece !== tick)).toEqual(
    pieces
      .filter((piece) => piece !== tick)
      .map((piece) => piece.replace(/^[^|]*/, "LiberationSerif")),
  );
  expect(lettersDrawn(pieces)).toBe(letters(run.text));
  expect(getDroppedBase14Chars()).toEqual([]);
  expect(await savedText(doc)).toContain("✓");
});

test("putting a run back in its document font leaves a kept letter where it is", async () => {
  const doc = await open("mixed-style-sample.pdf");
  const run = doc.page(0).runs.find((r) => r.text.includes("✓"))!;
  const original = run.fontId;
  const tick = drawn(doc, run).find((piece) => piece.endsWith("|✓"))!;
  new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: "Liberation Serif",
  }).apply(doc);

  const restore = new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: original,
  });
  expect(restore.wouldLoseText(doc)).toBe(false);
  restore.apply(doc);

  const pieces = drawn(doc, run);
  expect(run.fontId).toBe(original);
  expect(pieces).toContain(tick);
  expect(
    pieces.filter(
      (piece) => piece !== tick && !/^LiberationSans\|/.test(piece),
    ),
  ).toEqual([]);
  expect(lettersDrawn(pieces)).toBe(letters(run.text));
  expect(getDroppedBase14Chars()).toEqual([]);
});

test.each(["Liberation Serif", "Times-Roman"])(
  "putting a run back after %s leaves no letter in that font",
  async (family) => {
    const doc = await open("mixed-style-sample.pdf");
    const run = doc.page(0).runs.find((r) => r.text.includes("✓"))!;
    const original = run.fontId;
    new SetFontFamilyCommand({
      pageIndex: 0,
      runId: run.id,
      nextFamily: family,
    }).apply(doc);

    new SetFontFamilyCommand({
      pageIndex: 0,
      runId: run.id,
      nextFamily: original,
    }).apply(doc);

    const pieces = drawn(doc, run);
    expect(run.fontId).toBe(original);
    expect(
      pieces.filter((piece) => piece.startsWith(family.replace(/\s/g, ""))),
    ).toEqual([]);
    expect(lettersDrawn(pieces)).toBe(letters(run.text));
  },
);

test("a right-to-left word kept in its own font reads in the same order once saved", async () => {
  const doc = await open("rtl-sample.pdf");
  const run = doc.page(0).runs.find((r) => r.text.startsWith("Mixed"))!;
  const words = run.text.split(/\s+/);

  new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: "Times-Roman",
  }).apply(doc);

  expect(drawn(doc, run)).toContain("NotoSansHebrew|שלום");
  const saved = (await savedText(doc))
    .split("\n")
    .find((line) => line.startsWith("Mixed"))!;
  expect(saved.split(/\s+/)).toEqual(words);
});

test("a line the new font has no letter of is still drawn whole", async () => {
  const doc = await open("rtl-sample.pdf");
  const run = doc.page(0).runs.find((r) => /^[\u0590-\u05ff ]+$/.test(r.text))!;
  const before = drawn(doc, run);
  const order = contentOrder(doc);
  const cmd = new SetFontFamilyCommand({
    pageIndex: 0,
    runId: run.id,
    nextFamily: "Times-Roman",
  });

  expect(cmd.wouldLoseText(doc)).toBe(false);
  cmd.apply(doc);

  expect(lettersDrawn(drawn(doc, run))).toBe(letters(run.text));
  expect(getDroppedBase14Chars()).toEqual([]);

  cmd.revert(doc);
  expect(drawn(doc, run)).toEqual(before);
  expect(contentOrder(doc)).toEqual(order);
});

test.each(["Liberation Serif", "Times-Roman"])(
  "a change to %s that would leave shaped letters undrawn changes nothing",
  async (family) => {
    const doc = await open("shaped-line-sample.pdf");
    const run = doc.page(0).runs.find((r) => r.text.includes("2024"))!;
    const page = () => ({
      fontId: run.fontId,
      drawn: drawn(doc, run),
      order: contentOrder(doc),
    });
    const before = page();
    expect(lettersDrawn(before.drawn)).toBe(letters(run.text));
    const cmd = new SetFontFamilyCommand({
      pageIndex: 0,
      runId: run.id,
      nextFamily: family,
    });

    expect(cmd.wouldLoseText(doc)).toBe(true);
    expect(page()).toEqual(before);

    cmd.apply(doc);
    expect(page()).toEqual(before);
    expect(getDroppedBase14Chars()).toEqual([]);
    expect(await savedText(doc)).toContain("2024");

    cmd.revert(doc);
    expect(page()).toEqual(before);
  },
);

test("a font is known italic by the PDF's own name for it when its family name leaves the style out", async () => {
  const doc = await open("mixed-style-sample.pdf");
  const m = doc.module;
  const run = doc.page(0).runs.find((r) => r.text.includes("italic"))!;
  const fontOf = (word: string) => {
    const ptrs = run.paragraphLeafPtrs;
    const texts = readObjTexts(m, doc.page(0).pagePtr, ptrs);
    const ptr = ptrs[texts.findIndex((text) => text?.trim() === word)];
    return `pdf:${m.FPDFTextObj_GetFont(ptr)}:Liberation Sans`;
  };

  expect(isItalicFont(fontOf("italic"))).toBe(true);
  expect(isItalicFont(fontOf("both"))).toBe(true);
  expect(isItalicFont(fontOf("bold"))).toBe(false);
  expect(isItalicFont(fontOf("Plain"))).toBe(false);
});
