// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/rtl-marks-sample.pdf",
);
const HEBREW = "שָׁלוֹם עוֹלָם";
const ARABIC = "يُولَدُ جَمِيعُ النَّاسِ";

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

async function open(): Promise<EditorDocument> {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

const texts = (doc: EditorDocument) =>
  doc.page(0).runs.map((run) => run.text.normalize("NFC"));

test("reads each vowel mark after the letter it sits on", async () => {
  const doc = await open();

  expect(texts(doc)).toEqual([HEBREW, ARABIC].map((t) => t.normalize("NFC")));
});
