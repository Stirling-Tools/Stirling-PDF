// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import {
  collectMemberPtrs,
  measureObjBoundsPt,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);
const HEADING = "Heading in a bigger size";
const TWO_BREAKS = "Heading in\n\na bigger size";
const LINE_ONE = "Subset font sample line one";

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

async function open() {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  const heading = page.runs.find((r) => r.text === HEADING)!;
  const body = page.runs.find((r) => r !== heading)!;
  const bodyInk = () =>
    measureObjBoundsPt(doc.module, collectMemberPtrs(body))!.top;
  return { doc, heading, body, bodyInk, startTop: bodyInk() };
}

function type(
  doc: EditorDocument,
  history: HistoryStack,
  runId: string,
  texts: string[],
) {
  for (const nextText of texts)
    history.execute(
      new EditTextCommand({ pageIndex: 0, runId, nextText }),
      doc,
    );
}

test("a line break the space below can take leaves the next paragraph where it is", async () => {
  const { doc, heading, bodyInk, startTop } = await open();

  type(doc, new HistoryStack(), heading.id, ["Heading in\na bigger size"]);

  expect(bodyInk()).toBeCloseTo(startTop, 3);
});

test("moves the next paragraph down by the lines added over it", async () => {
  const { doc, heading, body, bodyInk, startTop } = await open();
  const bodyY = body.bounds.y;
  const headingBottom = heading.bounds.y;

  type(doc, new HistoryStack(), heading.id, [TWO_BREAKS]);

  const drop = headingBottom - heading.bounds.y;
  expect(drop).toBeGreaterThan(30);
  expect(bodyInk()).toBeCloseTo(startTop - drop, 3);
  expect(body.bounds.y).toBeCloseTo(bodyY - drop, 3);
  expect(bodyInk()).toBeLessThan(heading.bounds.y);
});

test.each([
  ["the line break alone", [TWO_BREAKS]],
  ["a line break then typing", [TWO_BREAKS, "Heading in\n\nXa bigger size"]],
  [
    "typing then a line break",
    ["Xk Heading in a bigger size", "Xk Heading in\n\na bigger size"],
  ],
  ["a line break then deleting", [TWO_BREAKS, "Heading in\n\na bigger"]],
  [
    "words typed around a line break",
    [
      `${HEADING} Zq7`,
      `Xk ${HEADING} Zq7`,
      "Xk Heading Wj9 in a bigger size Zq7",
      "Xk Heading Wj9 ina bigger size Zq7",
      "Xk Heading Wj9 ina\n\nbigger size Zq7",
    ],
  ],
])(
  "undo puts the paragraph back and redo moves it once, after %s",
  async (_case, texts) => {
    const { doc, heading, body, bodyInk, startTop } = await open();
    const bodyY = body.bounds.y;
    const history = new HistoryStack();

    type(doc, history, heading.id, texts);
    expect(history.size().undo).toBe(1);
    const pushedTop = bodyInk();

    history.undo(doc);
    expect(heading.text).toBe(HEADING);
    expect(bodyInk()).toBeCloseTo(startTop, 3);
    expect(body.bounds.y).toBeCloseTo(bodyY, 3);

    history.redo(doc);
    expect(bodyInk()).toBeCloseTo(pushedTop, 3);

    history.undo(doc);
    history.redo(doc);
    expect(bodyInk()).toBeCloseTo(pushedTop, 3);
  },
);

test.each([
  ["in one burst", false],
  ["as separate steps", true],
])(
  "deleting the added lines brings the paragraph back up, %s",
  async (_case, separate) => {
    const { doc, heading, bodyInk, startTop } = await open();
    const history = new HistoryStack();

    type(doc, history, heading.id, [TWO_BREAKS]);
    const pushedTop = bodyInk();
    if (separate) history.breakCoalescing();
    type(doc, history, heading.id, ["Heading in\na bigger size", HEADING]);
    expect(bodyInk()).toBeCloseTo(startTop, 3);

    history.undo(doc);
    if (separate) expect(bodyInk()).toBeCloseTo(pushedTop, 3);
    else expect(bodyInk()).toBeCloseTo(startTop, 3);
    history.redo(doc);
    expect(bodyInk()).toBeCloseTo(startTop, 3);
  },
);

test("deleting blank lines added after the text brings the paragraph back up", async () => {
  const { doc, heading, bodyInk, startTop } = await open();
  const history = new HistoryStack();

  type(doc, history, heading.id, [`${HEADING}\n\n`]);
  expect(bodyInk()).toBeLessThan(startTop - 30);
  type(doc, history, heading.id, [HEADING]);

  expect(bodyInk()).toBeCloseTo(startTop, 3);
});

test("line breaks in the document's own paragraph move the text below by their height, and joining them brings it back", async () => {
  const doc = await EditorDocument.open(
    new Uint8Array(
      await readFile(
        path.join(
          import.meta.dirname,
          "../../../tests/test-fixtures/mixed-style-sample.pdf",
        ),
      ),
    ),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  const [paragraph, below] = doc.page(0).runs;
  const startY = below.bounds.y;
  const original = paragraph.text;
  const history = new HistoryStack();
  const breaks = 7;

  type(doc, history, paragraph.id, [
    original.replace(" ", " " + "\n".repeat(breaks)),
  ]);
  // The box an edit gives the paragraph is not the one the document's text measured to; the lines are what moved.
  expect(startY - below.bounds.y).toBeCloseTo(
    breaks * paragraph.paragraphLineHeight,
    3,
  );

  history.breakCoalescing();
  type(doc, history, paragraph.id, [original]);
  expect(below.bounds.y).toBeCloseTo(startY, 3);
});

test.each([
  ["both at once", [HEADING]],
  ["one at a time", ["Heading in\na bigger size", HEADING]],
])(
  "a paragraph comes all the way back when the added lines go, %s, whatever the line height is by then",
  async (_case, back) => {
    const { doc, heading, bodyInk, startTop } = await open();
    const history = new HistoryStack();

    type(doc, history, heading.id, [TWO_BREAKS]);
    expect(bodyInk()).toBeLessThan(startTop - 30);
    history.breakCoalescing();
    heading.paragraphLineHeight *= 0.8;
    type(doc, history, heading.id, back);

    expect(bodyInk()).toBeCloseTo(startTop, 3);
  },
);

test("leaves a pushed paragraph where it is once it has been locked", async () => {
  const { doc, heading, body, bodyInk } = await open();
  const history = new HistoryStack();
  type(doc, history, heading.id, [TWO_BREAKS]);
  const pushedTop = bodyInk();
  body.locked = true;

  type(doc, history, heading.id, [HEADING]);

  expect(bodyInk()).toBeCloseTo(pushedTop, 3);
});

test("joining the document's own lines leaves the text below where it is", async () => {
  const doc = await EditorDocument.open(
    new Uint8Array(
      await readFile(
        path.join(
          import.meta.dirname,
          "../../../tests/test-fixtures/mixed-style-sample.pdf",
        ),
      ),
    ),
  );
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  const [paragraph, ...rest] = doc.page(0).runs;
  const below = rest.map((run) => run.bounds.y);

  type(doc, new HistoryStack(), paragraph.id, [
    paragraph.text.replaceAll("\n", " "),
  ]);

  expect(rest.map((run) => run.bounds.y)).toEqual(below);
});

test("moves nothing when the paragraph below is locked", async () => {
  const { doc, heading, body, bodyInk, startTop } = await open();
  body.locked = true;

  type(doc, new HistoryStack(), heading.id, [TWO_BREAKS]);

  expect(bodyInk()).toBeCloseTo(startTop, 3);
});

test.each([
  ["step by step", false],
  ["as one redraw of the whole burst", true],
])(
  "undo of a burst in a fallback font puts the lines below back, %s",
  async (_route, wholeBurst) => {
    if (wholeBurst)
      vi.spyOn(
        EditTextCommand.prototype as unknown as { revertsExactly(): boolean },
        "revertsExactly",
      ).mockReturnValue(false);
    const doc = await EditorDocument.open(
      new Uint8Array(
        await readFile(
          path.join(
            import.meta.dirname,
            "../../../tests/test-fixtures/subset-font-sample.pdf",
          ),
        ),
      ),
    );
    opened.push(doc);
    PdfiumTextReader.populate(doc, doc.page(0));
    const [first, second, third] = doc.page(0).runs;
    const ink = (run: typeof first) =>
      measureObjBoundsPt(doc.module, collectMemberPtrs(run))!.top;
    const [secondTop, thirdTop] = [ink(second), ink(third)];
    const history = new HistoryStack();

    type(doc, history, first.id, [`${LINE_ONE}Z`, `${LINE_ONE}Z\nmore`]);
    const pushedTop = ink(second);
    expect(pushedTop).toBeLessThan(secondTop - 10);
    expect(ink(third)).toBeCloseTo(thirdTop - (secondTop - pushedTop), 3);

    history.undo(doc);
    expect(ink(second)).toBeCloseTo(secondTop, 3);
    expect(ink(third)).toBeCloseTo(thirdTop, 3);

    history.redo(doc);
    expect(ink(second)).toBeCloseTo(pushedTop, 3);

    history.undo(doc);
    history.redo(doc);
    expect(ink(second)).toBeCloseTo(pushedTop, 3);
    expect(first.text).toBe(`${LINE_ONE}Z\nmore`);
  },
);
