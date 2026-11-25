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
  it,
  vi,
} from "vitest";
import {
  applyPartialEditPlan,
  planPartialEdit,
} from "@editor/tools/pdfTextEditor/commands/partialEdit";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { uniformTags } from "@editor/tools/pdfTextEditor/model/TextTags";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import {
  buildClassicPdf,
  streamBody,
} from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";

const opened: EditorDocument[] = [];

async function open(bytes: Uint8Array): Promise<EditorDocument> {
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

async function openChromePdf(): Promise<EditorDocument> {
  const file = path.join(
    import.meta.dirname,
    "../../../tests/test-fixtures/stirling-marketing.pdf",
  );
  return open(new Uint8Array(await readFile(file)));
}

/** One Helvetica line drawn a word per text object, so each word is a sub-run of its own. */
function wordPerObjectPdf(...words: Array<[string, number]>): Uint8Array {
  const content = words
    .map(([word, x]) => `BT /F1 12 Tf ${x} 700 Td (${word}) Tj ET\n`)
    .join("");
  return buildClassicPdf(
    [
      { num: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
      { num: 2, body: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>" },
      {
        num: 3,
        body:
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R " +
          "/Resources << /Font << /F1 5 0 R >> >> >>",
      },
      { num: 4, body: streamBody("", content) },
      {
        num: 5,
        body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      },
    ],
    1,
  );
}

function edit(doc: EditorDocument, prev: string, next: string) {
  const page = doc.page(0);
  const run = page.runs.find((r) => r.text === prev);
  if (!run) throw new Error(`no run reads "${prev}"`);
  const prevTexts = [...run.mergedFromTexts];
  const prevBounds = run.mergedFromBounds.map((b) => ({ ...b }));
  const before = (text: string) => prevBounds[prevTexts.indexOf(text)];
  const plan = planPartialEdit(run, prev, next);
  if (!plan) throw new Error("no plan");
  const result = applyPartialEditPlan(doc, page, run, plan, uniformTags([]));
  const after = (text: string) => {
    const i = result.newMergedFromTexts.indexOf(text);
    if (i < 0) throw new Error(`no object reads "${text}"`);
    return result.newMergedFromBounds[i];
  };
  return { fontSize: run.fontSize, before, after };
}

beforeAll(async () => {
  const wasmBytes = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(wasmBytes, {
          headers: { "Content-Type": "application/wasm" },
        }),
      ),
    ),
  );
});

afterEach(() => {
  while (opened.length) opened.pop()!.dispose();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("applyPartialEditPlan keeps the space after typed text", () => {
  it("puts text typed after a trailing space one space past the last letter", async () => {
    const doc = await openChromePdf();
    const { fontSize, after } = edit(doc, "Open Source ", "Open Source X");
    expect(after("X").x - after("e ").right).toBeGreaterThan(fontSize * 0.2);
  });

  it("moves the following word one space past a typed word that ends in a space", async () => {
    const doc = await open(wordPerObjectPdf(["Privacy", 72], ["First", 111.4]));
    const { fontSize, before, after } = edit(
      doc,
      "PrivacyFirst",
      "Privacy Big First",
    );
    const oldGap = before("First").x - before("Privacy").right;
    const space = after("First").x - after("Big").right - oldGap;
    expect(space).toBeGreaterThan(fontSize * 0.2);
    expect(space).toBeLessThan(fontSize * 0.35);
  });
});
