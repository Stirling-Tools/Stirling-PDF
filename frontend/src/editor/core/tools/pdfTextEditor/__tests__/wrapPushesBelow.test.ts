// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import {
  collectMemberPtrs,
  measureObjBoundsPt,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const TABLE_BELOW = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/sample.pdf",
);
const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);
const HEADING = "Heading in a bigger size";
const LONG = `${HEADING} that the user keeps typing well past the right edge of the page, on and on, until it needs three more lines`;

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
  const pageRight = page.display.cropLeft + page.display.cropWidth;
  return { doc, heading, body, bodyInk, pageRight };
}

function typeAndWrap(
  doc: EditorDocument,
  history: HistoryStack,
  runId: string,
  maxWidthPt: number,
) {
  history.execute(
    new EditTextCommand({ pageIndex: 0, runId, nextText: LONG }),
    doc,
  );
  history.execute(
    new ReflowWrapCommand({ pageIndex: 0, runId, maxWidthPt }),
    doc,
  );
}

test("lines a wrap adds move the text below down by their height", async () => {
  const { doc, heading, body, bodyInk, pageRight } = await open();
  const startTop = bodyInk();
  const bodyY = body.bounds.y;

  typeAndWrap(
    doc,
    new HistoryStack(),
    heading.id,
    pageRight - heading.bounds.x,
  );

  const added = heading.text.split("\n").length - 1;
  expect(added).toBeGreaterThan(0);
  const drop = added * heading.paragraphLineHeight;
  expect(body.bounds.y).toBeCloseTo(bodyY - drop, 3);
  expect(bodyInk()).toBeCloseTo(startTop - drop, 3);
  expect(bodyInk()).toBeLessThan(heading.bounds.y);
  expect(heading.bounds.x + heading.bounds.width).toBeLessThanOrEqual(
    pageRight,
  );
});

test("undo puts the text below back exactly and redo moves it once", async () => {
  const { doc, heading, body, bodyInk, pageRight } = await open();
  const startTop = bodyInk();
  const bodyY = body.bounds.y;
  const history = new HistoryStack();

  typeAndWrap(doc, history, heading.id, pageRight - heading.bounds.x);
  expect(history.size().undo).toBe(1);
  const pushedTop = bodyInk();
  expect(pushedTop).toBeLessThan(startTop - 10);

  history.undo(doc);
  expect(heading.text).toBe(HEADING);
  expect(bodyInk()).toBeCloseTo(startTop, 3);
  expect(body.bounds.y).toBeCloseTo(bodyY, 3);

  history.redo(doc);
  expect(bodyInk()).toBeCloseTo(pushedTop, 3);
  history.undo(doc);
  history.redo(doc);
  expect(bodyInk()).toBeCloseTo(pushedTop, 3);
});

test("deleting the wrapped words brings the text below back up", async () => {
  const { doc, heading, bodyInk, pageRight } = await open();
  const startTop = bodyInk();
  const history = new HistoryStack();

  typeAndWrap(doc, history, heading.id, pageRight - heading.bounds.x);
  expect(bodyInk()).toBeLessThan(startTop - 10);
  history.breakCoalescing();
  history.execute(
    new EditTextCommand({ pageIndex: 0, runId: heading.id, nextText: HEADING }),
    doc,
  );

  expect(bodyInk()).toBeCloseTo(startTop, 3);
});

test("typing on after a wrap and wrapping again stays one undo step that puts everything back", async () => {
  const { doc, heading, body, bodyInk, pageRight } = await open();
  const startTop = bodyInk();
  const bodyY = body.bounds.y;
  const history = new HistoryStack();
  const width = pageRight - heading.bounds.x;

  typeAndWrap(doc, history, heading.id, width);
  const firstLines = heading.text.split("\n").length;
  const firstTop = bodyInk();
  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: heading.id,
      nextText: `${heading.text} and then a pause before typing a good deal more`,
    }),
    doc,
  );
  history.execute(
    new ReflowWrapCommand({
      pageIndex: 0,
      runId: heading.id,
      maxWidthPt: width,
    }),
    doc,
  );
  const added = heading.text.split("\n").length - firstLines;
  expect(added).toBeGreaterThan(0);
  expect(bodyInk()).toBeLessThanOrEqual(firstTop);
  expect(bodyInk()).toBeLessThan(heading.bounds.y);
  expect(history.size().undo).toBe(1);
  const pushedTop = bodyInk();
  const wrappedText = heading.text;

  history.undo(doc);
  expect(heading.text).toBe(HEADING);
  expect(bodyInk()).toBeCloseTo(startTop, 3);
  expect(body.bounds.y).toBeCloseTo(bodyY, 3);

  history.redo(doc);
  expect(heading.text).toBe(wrappedText);
  expect(bodyInk()).toBeCloseTo(pushedTop, 3);
});

async function openTableBelow() {
  const doc = await EditorDocument.open(
    new Uint8Array(await readFile(TABLE_BELOW)),
  );
  opened.push(doc);
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  const line = page.runs.find((r) => r.text.startsWith("Test document"))!;
  const width = page.display.cropLeft + page.display.cropWidth - line.bounds.x;
  return { doc, page, line, width };
}

const PAST_EDGE =
  "Test document for word documents and this sentence keeps going far beyond the right edge of the page so that it has to wrap onto new lines";

test.each([
  ["refuses", true],
  ["still wraps when not asked to keep clear", false],
])(
  "a wrap whose new line would land on a table drawn below %s",
  async (_case, keepClearBelow) => {
    const { doc, page, line, width } = await openTableBelow();
    const history = new HistoryStack();
    const others = page.runs
      .filter((r) => r !== line)
      .map((r) => ({ ...r.bounds }));
    history.execute(
      new EditTextCommand({
        pageIndex: 0,
        runId: line.id,
        nextText: PAST_EDGE,
      }),
      doc,
    );
    const reflow = new ReflowWrapCommand({
      pageIndex: 0,
      runId: line.id,
      maxWidthPt: width,
      keepClearBelow,
    });
    history.execute(reflow, doc);

    expect(reflow.refusedForSpaceBelow).toBe(keepClearBelow);
    expect(line.text.includes("\n")).toBe(!keepClearBelow);
    expect(page.runs.filter((r) => r !== line).map((r) => r.bounds)).toEqual(
      others,
    );
    history.undo(doc);
    expect(line.text).not.toBe(PAST_EDGE);
    history.redo(doc);
    expect(reflow.refusedForSpaceBelow).toBe(keepClearBelow);
    expect(line.text.includes("\n")).toBe(!keepClearBelow);
  },
);

test("a wrap with clear space below is not refused", async () => {
  const { doc, heading, bodyInk, pageRight } = await open();
  const startTop = bodyInk();
  const history = new HistoryStack();
  history.execute(
    new EditTextCommand({ pageIndex: 0, runId: heading.id, nextText: LONG }),
    doc,
  );
  const reflow = new ReflowWrapCommand({
    pageIndex: 0,
    runId: heading.id,
    maxWidthPt: pageRight - heading.bounds.x,
    keepClearBelow: true,
  });
  history.execute(reflow, doc);
  expect(reflow.refusedForSpaceBelow).toBe(false);
  expect(heading.text.includes("\n")).toBe(true);
  expect(bodyInk()).toBeLessThan(startTop - 10);
});
