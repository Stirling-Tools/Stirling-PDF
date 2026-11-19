// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/rotated-text-sample.pdf",
);

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

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

describe("editing turned text", () => {
  test("keeps several typed words one line when the file is opened again", async () => {
    const doc = await open(new Uint8Array(await readFile(SAMPLE)));
    const run = doc.page(0).runs.find((r) => r.text.includes("Rotated"))!;
    const edited = `Xk ${run.text} Wj9 Zq7`;
    for (let end = run.text.length + 3; end <= edited.length; end++)
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: edited.slice(0, end),
      }).apply(doc);

    const saved = new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
    const again = await open(saved);
    expect(again.page(0).runs.map((r) => r.text)).toEqual([edited]);
  });
});
