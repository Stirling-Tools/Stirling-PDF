// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
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

async function open(bytes: Uint8Array) {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

test.each([
  ["sample.pdf", " A   B"],
  ["paragraph-sample.pdf", " A   B"],
  ["sample.pdf", " A  B    C"],
  ["subset-font-sample.pdf", " A   B"],
])(
  "spaces typed onto a line of %s read back as typed: %j",
  async (name, typed) => {
    const doc = await open(
      new Uint8Array(await readFile(path.join(FIXTURES, name))),
    );
    const run = doc
      .page(0)
      .runs.find((r) => !r.text.includes("\n") && r.text.trim().length > 3)!;
    const nextText = run.text.trimEnd() + typed;
    new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }).apply(doc);

    const saved = await open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );

    expect(saved.page(0).runs.map((r) => r.text.trimEnd())).toContain(nextText);
  },
);
