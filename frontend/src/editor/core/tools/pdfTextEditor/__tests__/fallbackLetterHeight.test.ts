// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { collectMemberPtrs } from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { xHeightEm } from "@editor/tools/pdfTextEditor/charcode/fontGlyphs";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
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
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function subsetSample() {
  const doc = await EditorDocument.open(
    new Uint8Array(
      await readFile(path.join(FIXTURES, "subset-font-sample.pdf")),
    ),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  const run = doc.page(0).runs.find((r) => r.text.startsWith("Editing"))!;
  return { doc, run };
}

/** Each drawn object's lower-case height in points, keyed by the text it draws. */
function letterHeights(doc: EditorDocument, runId: string) {
  const m = doc.module;
  const page = doc.page(0);
  const size = m.pdfium.wasmExports.malloc(8);
  const buf = m.pdfium.wasmExports.malloc(512);
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  try {
    return collectMemberPtrs(page.findRun(runId)!).map((ptr) => {
      m.FPDFTextObj_GetFontSize(ptr, size);
      m.FPDFTextObj_GetText(ptr, textPage, buf, 512);
      const font = m.FPDFTextObj_GetFont(ptr);
      return {
        text: m.pdfium.UTF16ToString(buf).trim(),
        embedded: m.FPDFFont_GetIsEmbedded(font) === 1,
        height: xHeightEm(m, font)! * m.pdfium.getValue(size, "float"),
      };
    });
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(size);
    m.pdfium.wasmExports.free(buf);
  }
}

test("letters a subset lacks are drawn with lower-case letters as tall as the subset's", async () => {
  const { doc, run } = await subsetSample();
  new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `${run.text} several more words`,
  }).apply(doc);

  const heights = letterHeights(doc, run.id);
  const own = heights.find((h) => h.embedded)!.height;
  const standIns = heights.filter((h) => !h.embedded);
  expect(standIns.map((h) => h.text)).toEqual(["several", "more", "words"]);
  for (const h of standIns) expect(h.height).toBeCloseTo(own, 1);
});

test("stand-in words split by a later edit keep the matched height", async () => {
  const { doc, run } = await subsetSample();
  new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `${run.text} several more`,
  }).apply(doc);
  const typed = doc.page(0).findRun(run.id)!.text;
  new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: typed.replace("several", "sev QQ eral"),
  }).apply(doc);

  const heights = letterHeights(doc, run.id);
  const own = heights.find((h) => h.embedded)!.height;
  const standIns = heights.filter((h) => !h.embedded);
  expect(standIns.map((h) => h.text)).toEqual(
    expect.arrayContaining(["sev", "QQ"]),
  );
  for (const h of standIns) expect(h.height).toBeCloseTo(own, 1);
});

test("a line starting with a stand-in word reopens at the size of its own letters", async () => {
  const { doc, run } = await subsetSample();
  new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `Quiz ${run.text}`,
  }).apply(doc);
  expect(letterHeights(doc, run.id)[0]).toMatchObject({
    text: "Quiz",
    embedded: false,
  });

  const saved = await EditorDocument.open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  opened.push(saved);
  PdfiumTextReader.populate(saved, saved.page(0));

  expect(
    saved.page(0).runs.find((r) => r.text.startsWith("Quiz Editing"))?.fontSize,
  ).toBe(run.fontSize);
});

test("words typed across the gap between two drawn pieces keep the space between them", async () => {
  const { doc, run } = await subsetSample();
  new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: `${run.text} several more`,
  }).apply(doc);
  const typed = doc.page(0).findRun(run.id)!.text;
  new EditTextCommand({
    pageIndex: 0,
    runId: run.id,
    nextText: typed
      .replace("must", "muqst")
      .replace("cleanly", "cleaZnly Mixwordz")
      .replace("several", "sev QQ eral"),
  }).apply(doc);

  const drawn = letterHeights(doc, run.id).map((h) => h.text);
  expect(drawn).toEqual(expect.arrayContaining(["Mixwordz", "sev"]));

  const saved = await EditorDocument.open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  opened.push(saved);
  PdfiumTextReader.populate(saved, saved.page(0));
  expect(
    saved.page(0).runs.find((r) => r.text.startsWith("Editing"))?.text,
  ).toContain("Mixwordz sev QQ eral");
});
