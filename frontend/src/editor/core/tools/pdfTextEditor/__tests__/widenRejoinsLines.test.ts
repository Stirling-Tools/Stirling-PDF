// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { resizeRunCommand } from "@editor/tools/pdfTextEditor/commands/resizeRun";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasm, { headers: { "Content-Type": "application/wasm" } }),
    ),
  );
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function open(source: string | Uint8Array, pageIndex = 0) {
  const bytes =
    typeof source === "string"
      ? new Uint8Array(await readFile(path.join(FIXTURES, source)))
      : source;
  const doc = await EditorDocument.open(bytes);
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(pageIndex));
  return doc;
}

function runStarting(doc: EditorDocument, start: string, pageIndex = 0) {
  const run = doc
    .page(pageIndex)
    .runs.find((r) => r.text.trimStart().startsWith(start));
  if (!run) throw new Error(`no run starting "${start}"`);
  return run;
}

function resize(
  doc: EditorDocument,
  history: HistoryStack,
  run: TextRun,
  width: number,
  pageIndex = 0,
) {
  const cmd = resizeRunCommand(doc, pageIndex, run.id, width);
  if (cmd) history.execute(cmd, doc);
}

const lines = (run: TextRun) => run.text.split("\n").map((l) => l.trim());
const words = (text: string) => text.replace(/\s+/g, " ").trim();
const pageWidth = (doc: EditorDocument) => doc.page(0).display.cropWidth;

function positions(doc: EditorDocument, run: TextRun): string {
  const m = doc.module;
  const buf = m.pdfium.wasmExports.malloc(16);
  try {
    return run.paragraphLeafPtrs
      .map((ptr) => {
        m.FPDFPageObj_GetBounds(ptr, buf, buf + 4, buf + 8, buf + 12);
        return [0, 4, 8, 12]
          .map((o) => m.pdfium.getValue(buf + o, "float").toFixed(2))
          .join(",");
      })
      .join(" ");
  } finally {
    m.pdfium.wasmExports.free(buf);
  }
}

test("narrowing a paragraph and widening it back restores its document lines", async () => {
  const doc = await open("paragraph-sample.pdf");
  const history = new HistoryStack();
  const run = runStarting(doc, "First line of the body");
  const original = run.text;
  const width = run.bounds.width;

  resize(doc, history, run, width * 0.6);
  expect(lines(run).length).toBeGreaterThan(4);
  resize(doc, history, run, width);

  expect(run.text).toBe(original);
});

test("widening to the page edge pulls words up across the margin's breaks but not across a line the author ended, and undo restores it", async () => {
  const doc = await open("paragraph-sample.pdf");
  const history = new HistoryStack();
  const run = runStarting(doc, "First line of the body");
  const original = run.text;
  const bounds = { ...run.bounds };
  const placed = positions(doc, run);

  resize(doc, history, run, pageWidth(doc) - run.bounds.x - 10);
  const widened = run.text;

  expect(lines(run)[0]).toBe(
    "First line of the body paragraph that we want grouped together. Second",
  );
  expect(words(widened)).toBe(words(original));
  expect(lines(run).at(-1)).toBe(
    "Fourth line wraps the paragraph at the bottom of the column.",
  );

  history.undo(doc);
  expect(run.text).toBe(original);
  expect(run.bounds).toEqual(bounds);
  expect(positions(doc, run)).toBe(placed);

  history.redo(doc);
  expect(run.text).toBe(widened);

  const saved = new Uint8Array(await (await exportToBlob(doc)).arrayBuffer());
  const reopened = await open(saved);
  expect(lines(runStarting(reopened, "First line of the body"))).toEqual(
    lines(run),
  );
});

test("a line the user ended with Enter stays ended when the box widens", async () => {
  const doc = await open("paragraph-sample.pdf");
  const history = new HistoryStack();
  const run = runStarting(doc, "First line of the body");
  const typed = run.text.replace("Second line", "Second\nline");
  expect(typed).not.toBe(run.text);
  history.execute(
    new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: typed }),
    doc,
  );

  resize(doc, history, run, pageWidth(doc) - run.bounds.x - 10);

  expect(lines(run).length).toBeLessThan(typed.split("\n").length);
  expect(lines(run).some((l) => l.endsWith("Second"))).toBe(true);
  expect(lines(run).some((l) => l.startsWith("line continues"))).toBe(true);
});

test("widening justified copy joins the lines it was set to", async () => {
  const doc = await open("justified-sample.pdf");
  const history = new HistoryStack();
  const run = runStarting(doc, "Justified copy");
  const original = run.text;

  resize(doc, history, run, run.bounds.width * 2);

  expect(lines(run).length).toBeLessThan(original.split("\n").length);
  expect(words(run.text)).toBe(words(original));
});

test("widening one paragraph never pulls in the next, and keeps its hyphenated breaks", async () => {
  const doc = await open("mushroom-life.pdf");
  const history = new HistoryStack();
  const run = runStarting(doc, "Mushrooms represent");
  const next = runStarting(doc, "Spore Stage");
  const nextText = next.text;
  const nextTop = next.bounds.y + next.bounds.height;
  const lineCount = lines(run).length;

  resize(doc, history, run, run.bounds.width * 1.4);

  expect(lines(run).length).toBeLessThan(lineCount);
  expect(next.text).toBe(nextText);
  expect(run.text).not.toContain("Spore Stage");
  expect(run.text).toContain("posi-\ntion");
  expect(next.bounds.y + next.bounds.height).toBeCloseTo(nextTop, 3);
});

test("short lines of a list stay apart however wide the box gets", async () => {
  const doc = await open("cairo-styles.pdf");
  const history = new HistoryStack();
  const run = runStarting(doc, "First bullet item");
  const original = run.text;

  resize(doc, history, run, pageWidth(doc) - run.bounds.x - 10);

  expect(run.text).toBe(original);
});

test("narrowing the heading wraps it and pushes the body down, and widening it back makes it one line and lets the body back up", async () => {
  const doc = await open("paragraph-sample.pdf");
  const history = new HistoryStack();
  const run = runStarting(doc, "Heading in a bigger size");
  const body = runStarting(doc, "First line of the body");
  const bodyY = body.bounds.y;
  const width = run.bounds.width;

  resize(doc, history, run, width * 0.5);
  expect(lines(run).length).toBeGreaterThan(1);
  expect(body.bounds.y).toBeLessThan(bodyY - 1);
  resize(doc, history, run, width + 2);

  expect(run.text).toBe("Heading in a bigger size");
  expect(body.bounds.y).toBeCloseTo(bodyY, 3);
});
