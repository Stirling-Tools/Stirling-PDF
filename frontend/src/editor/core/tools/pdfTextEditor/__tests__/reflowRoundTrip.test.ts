// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const FIXTURES = path.join(import.meta.dirname, "../../../tests/test-fixtures");
const FILES = [
  "paragraph-sample.pdf",
  "mixed-style-sample.pdf",
  "justified-sample.pdf",
  "letter-spacing-sample.pdf",
  "multi-page-sample.pdf",
  "mushroom-life.pdf",
  "form-xobject-sample.pdf",
  "link-annotations-sample.pdf",
];

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
  vi.restoreAllMocks();
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function open(file: string) {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(path.join(FIXTURES, file))),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  return doc;
}

// Break after the middle word of the first line, as Enter there would.
function withBreaks(text: string, breaks: number): string {
  const line = text.split("\n")[0];
  const at = line.indexOf(" ", Math.floor(line.length / 2)) + 1 || line.length;
  return text.slice(0, at) + "\n".repeat(breaks) + text.slice(at);
}

const editable = (run: TextRun) =>
  !run.locked && run.renderMode !== 3 && run.text.trim().length >= 4;

function others(doc: EditorDocument, edited: TextRun): string {
  return doc
    .page(0)
    .runs.filter((r) => r !== edited)
    .map((r) => `${r.id} ${r.bounds.x.toFixed(2)} ${r.bounds.y.toFixed(2)}`)
    .join("\n");
}

function type(
  doc: EditorDocument,
  history: HistoryStack,
  run: TextRun,
  text: string,
) {
  history.execute(
    new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: text }),
    doc,
  );
  history.breakCoalescing();
}

test.each(FILES)(
  "in %s, taking added lines away leaves every other line where that many fewer Enters would have put it",
  async (file) => {
    const count = (await open(file)).page(0).runs.filter(editable).length;
    for (let index = 0; index < Math.min(count, 8); index++) {
      const once = await open(file);
      const onceRun = once.page(0).runs.filter(editable)[index];
      const original = onceRun.text;
      const start = others(once, onceRun);
      type(once, new HistoryStack(), onceRun, withBreaks(original, 1));
      const afterOne = others(once, onceRun);

      const doc = await open(file);
      const run = doc.page(0).runs.filter(editable)[index];
      const history = new HistoryStack();
      type(doc, history, run, withBreaks(original, 1));
      type(doc, history, run, withBreaks(original, 2));
      type(doc, history, run, withBreaks(original, 3));
      type(doc, history, run, withBreaks(original, 1));
      expect(others(doc, run), `${file} run ${index} back to one`).toBe(
        afterOne,
      );
      type(doc, history, run, original);
      expect(others(doc, run), `${file} run ${index} back to none`).toBe(start);

      while (history.size().undo > 0) history.undo(doc);
      expect(others(doc, run), `${file} run ${index} undone`).toBe(start);
      while (history.size().redo > 0) history.redo(doc);
      expect(others(doc, run), `${file} run ${index} redone`).toBe(start);
    }
  },
);

test.each(FILES)(
  "in %s, a burst of added and removed lines undoes and redoes as one step that is replayed whole",
  async (file) => {
    vi.spyOn(
      EditTextCommand.prototype as unknown as { revertsExactly(): boolean },
      "revertsExactly",
    ).mockReturnValue(false);
    const count = (await open(file)).page(0).runs.filter(editable).length;
    for (let index = 0; index < Math.min(count, 4); index++) {
      const doc = await open(file);
      const run = doc.page(0).runs.filter(editable)[index];
      const original = run.text;
      const start = others(doc, run);
      const history = new HistoryStack();
      for (const breaks of [1, 2, 3, 1])
        history.execute(
          new EditTextCommand({
            pageIndex: 0,
            runId: run.id,
            nextText: withBreaks(original, breaks),
          }),
          doc,
        );
      expect(history.size().undo).toBe(1);
      const typed = others(doc, run);

      history.undo(doc);
      expect(others(doc, run), `${file} run ${index} undone`).toBe(start);
      history.redo(doc);
      expect(others(doc, run), `${file} run ${index} redone`).toBe(typed);

      history.breakCoalescing();
      type(doc, history, run, original);
      expect(others(doc, run), `${file} run ${index} cleared`).toBe(start);
    }
  },
);

// How much of their height two runs share, where they share any width.
function shared(a: TextRun, ay: number, b: TextRun): number {
  if (
    a.bounds.x >= b.bounds.x + b.bounds.width - 0.5 ||
    a.bounds.x + a.bounds.width <= b.bounds.x + 0.5
  )
    return 0;
  return Math.max(
    0,
    Math.min(ay + a.bounds.height, b.bounds.y + b.bounds.height) -
      Math.max(ay, b.bounds.y),
  );
}

test.each(FILES)(
  "in %s, a line moved by Enter never comes down on a line that stayed, and nothing above the edited text moves",
  async (file) => {
    const count = (await open(file)).page(0).runs.filter(editable).length;
    for (let index = 0; index < Math.min(count, 8); index++) {
      const doc = await open(file);
      const run = doc.page(0).runs.filter(editable)[index];
      const original = run.text;
      const history = new HistoryStack();
      for (const breaks of [1, 2, 3]) {
        const others = doc.page(0).runs.filter((r) => r !== run);
        const was = new Map(others.map((r) => [r.id, r.bounds.y]));
        const bottom = run.bounds.y;
        type(doc, history, run, withBreaks(original, breaks));
        const moved = others.filter(
          (r) => Math.abs(r.bounds.y - was.get(r.id)!) > 0.3,
        );
        const stayed = others.filter((r) => !moved.includes(r));
        const label = `${file} run ${index}, ${breaks} breaks`;
        expect(
          moved.filter((m) => was.get(m.id)! > bottom + 0.5).map((m) => m.text),
          `${label}: moved from above the edited text`,
        ).toEqual([]);
        expect(
          moved
            .filter((m) =>
              stayed.some(
                (s) =>
                  shared(m, m.bounds.y, s) > shared(m, was.get(m.id)!, s) + 0.5,
              ),
            )
            .map((m) => m.text),
          `${label}: came down on a line that stayed`,
        ).toEqual([]);
      }
    }
  },
);
