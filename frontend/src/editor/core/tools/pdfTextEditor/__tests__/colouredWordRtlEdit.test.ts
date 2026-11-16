// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  openSample,
  sameColour,
  wordColours,
} from "@editor/tools/pdfTextEditor/__tests__/colouredWordFixture";

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(wasm, {
          headers: { "Content-Type": "application/wasm" },
        }),
    ),
  );
});

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

async function open(bytes?: Uint8Array): Promise<EditorDocument> {
  const doc = await openSample(bytes);
  opened.push(doc);
  return doc;
}

// Hebrew is drawn right to left, so its letters read backwards along the page.
const drawnLeftToRight = (word: string) => [...word].reverse().join("");

test.each([
  ["inside the blue word", "שלום", 2, "שללום", "blue"],
  ["after a black word", "הטלפון", 6, "הטלפוןל", "black"],
] as const)(
  "a letter typed into a right-to-left line %s takes that word's colour, through undo and save",
  async (_name, needle, at, word, colour) => {
    const doc = await open();
    const history = new HistoryStack();
    const run = doc.page(0).runs.find((r) => r.text.includes(needle))!;
    const i = run.text.indexOf(needle) + at;
    history.execute(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: run.text.slice(0, i) + "ל" + run.text.slice(i),
      }),
      doc,
    );
    const drawn = drawnLeftToRight(word);
    expect(wordColours(doc, drawn)).toEqual(sameColour(colour, word.length));
    const saved = await open(
      new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
    );
    expect(wordColours(saved, drawn)).toEqual(sameColour(colour, word.length));
    history.undo(doc);
    expect(wordColours(doc, drawnLeftToRight("שלום"))).toEqual(
      sameColour("blue", 4),
    );
  },
);
