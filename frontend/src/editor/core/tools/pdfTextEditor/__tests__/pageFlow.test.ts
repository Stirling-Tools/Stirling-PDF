import { beforeEach, expect, test } from "vitest";
import { allowConsole } from "@editor/tests/failOnConsole";
import { degrees, PDFDocument } from "@cantoo/pdf-lib";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { SetLineSpacingCommand } from "@editor/tools/pdfTextEditor/commands/SetLineSpacingCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetParagraphFormatCommand } from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import {
  bottomLimit,
  flowPastBottom,
  runBottom,
} from "@editor/tools/pdfTextEditor/util/pageFlow";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { storeWith } = editorStores();

// jsdom has no canvas; the overlay's text measurement falls back without one.
const NO_CANVAS = /HTMLCanvasElement's getContext\(\) method/;
beforeEach(() => allowConsole.error(NO_CANVAS));

async function twoBlankPages() {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  doc.addPage([400, 300]);
  return doc.save();
}

async function typedNearBottom() {
  const store = await storeWith(await twoBlankPages());
  ensurePageRead(store, 1);
  const insert = new InsertTextCommand({
    pageIndex: 0,
    x: 40,
    y: 50,
    text: "Line one",
  });
  store.dispatch(insert);
  const runId = insert.insertedRunId!;
  return { store, runId };
}

function edit(
  store: Awaited<ReturnType<typeof typedNearBottom>>["store"],
  runId: string,
  text: string,
) {
  const run = store.document!.page(0).findRun(runId)!;
  const before = runBottom(run);
  store.dispatch(new EditTextCommand({ pageIndex: 0, runId, nextText: text }));
  return flowPastBottom(store, 0, runId, before);
}

test("lines typed past the bottom margin move to the top of the blank page after, as one undo step", async () => {
  const { store, runId } = await typedNearBottom();
  const page = store.document!.page(0);
  expect(runBottom(page.findRun(runId)!)).toBeGreaterThan(bottomLimit(page));

  expect(edit(store, runId, "Line one\n")).toBe("none");
  expect(edit(store, runId, "Line one\nLine two")).toBe("moved");

  const next = store.document!.page(1);
  expect(page.findRun(runId)!.text).toBe("Line one");
  expect(next.runs.map((r) => r.text)).toEqual(["Line two"]);
  const moved = next.runs[0];
  expect(moved.fontSize).toBe(page.findRun(runId)!.fontSize);
  expect(moved.bounds.y).toBeGreaterThan(next.height / 2);

  store.undo();
  expect(page.findRun(runId)!.text).toBe("Line one\nLine two");
  expect(store.document!.page(1).runs).toHaveLength(0);
});

test("text carried onto the next page keeps its font, alignment and underline", async () => {
  const { store, runId } = await typedNearBottom();
  store.dispatch(
    new SetFontFamilyCommand({
      pageIndex: 0,
      runId,
      nextFamily: "Times-Bold",
    }),
  );
  store.dispatch(
    new SetParagraphFormatCommand({
      pageIndex: 0,
      runIds: [runId],
      align: "center",
      underline: true,
    }),
  );

  expect(edit(store, runId, "Line one\nLine two")).toBe("moved");

  const next = store.document!.page(1);
  const moved = next.runs[0];
  expect([moved.fontId, moved.align, moved.underline]).toEqual([
    "base14:Times-Bold",
    "center",
    true,
  ]);
  expect(next.underlines.get(moved.id)).toHaveLength(1);
});

test("text the page already drew below the margin stays put", async () => {
  const store = await storeWith(await twoBlankPages());
  ensurePageRead(store, 1);
  const insert = new InsertTextCommand({
    pageIndex: 0,
    x: 40,
    y: 20,
    text: "Footer",
  });
  store.dispatch(insert);
  const runId = insert.insertedRunId!;
  expect(edit(store, runId, "Footer\nPage 1")).toBe("none");
  expect(store.document!.page(1).runs).toHaveLength(0);
});

test("text flowing to a page with another origin keeps its distance from the left edge", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]).setMediaBox(100, 100, 400, 300);
  doc.addPage([400, 300]);
  const store = await storeWith(await doc.save());
  ensurePageRead(store, 1);
  const insert = new InsertTextCommand({
    pageIndex: 0,
    x: 140,
    y: 150,
    text: "Line one",
  });
  store.dispatch(insert);
  const runId = insert.insertedRunId!;
  const run = store.document!.page(0).findRun(runId)!;
  const before = runBottom(run);
  store.dispatch(
    new EditTextCommand({
      pageIndex: 0,
      runId,
      nextText: "Line one\nLine two",
    }),
  );
  expect(flowPastBottom(store, 0, runId, before)).toBe("moved");
  const [moved] = store.document!.page(1).runs;
  expect(moved.bounds.x).toBeCloseTo(run.bounds.x - 100, 0);
});

test("text never flows onto a turned page, which would show it sideways", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  doc.addPage([400, 300]).setRotation(degrees(90));
  const store = await storeWith(await doc.save());
  ensurePageRead(store, 1);
  const insert = new InsertTextCommand({
    pageIndex: 0,
    x: 40,
    y: 50,
    text: "Line one",
  });
  store.dispatch(insert);
  const runId = insert.insertedRunId!;
  const before = runBottom(store.document!.page(0).findRun(runId)!);
  store.dispatch(
    new EditTextCommand({
      pageIndex: 0,
      runId,
      nextText: "Line one\nLine two",
    }),
  );
  expect(flowPastBottom(store, 0, runId, before)).toBe("moved");
  const edited = store.document!;
  expect(edited.page(1).runs).toHaveLength(0);
  expect(edited.displayOrder()).toEqual([0, 2, 1]);
  expect(edited.page(2).runs.map((run) => run.text)).toEqual(["Line two"]);
});

test("lines that flow again from the same paragraph join its continuation, not a new page", async () => {
  const { store, runId } = await typedNearBottom();
  expect(edit(store, runId, "Line one\nLine two")).toBe("moved");
  const doc = store.document!;
  const order = [...doc.displayOrder()];
  const continuation = doc.page(1).runs.map((run) => run.text);
  expect(continuation).toEqual(["Line two"]);

  expect(edit(store, runId, "Line one\nLine one and a half")).toBe("moved");
  expect(doc.displayOrder()).toEqual(order);
  expect(doc.page(0).findRun(runId)?.text).toBe("Line one");
  expect(doc.page(1).runs.map((run) => run.text)).toEqual([
    "Line one and a half\nLine two",
  ]);
});

test("a continuation keeps the paragraph's line spacing instead of growing it", async () => {
  const { store, runId } = await typedNearBottom();
  store.dispatch(new SetLineSpacingCommand({ pageIndex: 0, runId, factor: 2 }));
  const source = store.document!.page(0).findRun(runId)!;
  const lineHeight = source.paragraphLineHeight;
  const before = runBottom(source);
  store.dispatch(
    new EditTextCommand({
      pageIndex: 0,
      runId,
      nextText: "Line one\nLine two\nLine three",
    }),
  );
  expect(flowPastBottom(store, 0, runId, before)).toBe("moved");
  const [moved] = store.document!.page(1).runs;
  expect(moved.paragraphLineHeight).toBeCloseTo(lineHeight, 1);
});

test("a locked continuation keeps its text and the overflow stays on the source page", async () => {
  const { store, runId } = await typedNearBottom();
  expect(edit(store, runId, "Line one\nLine two")).toBe("moved");
  const [continuation] = store.document!.page(1).runs;
  continuation.locked = true;

  expect(edit(store, runId, "Line one\nLine one and a half")).toBe("none");
  expect(store.document!.page(0).findRun(runId)?.text).toBe(
    "Line one\nLine one and a half",
  );
  expect(store.document!.page(1).runs.map((run) => run.text)).toEqual([
    "Line two",
  ]);
});

test("a line with no wrap width wraps inside the next page's margins when it flows", async () => {
  const { store, runId } = await typedNearBottom();
  expect(store.document!.page(0).findRun(runId)!.wrapWidthPt).toBeNull();
  const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
  expect(edit(store, runId, `Line one\n${long}`)).toBe("moved");
  const next = store.document!.page(1);
  const [moved] = next.runs;
  expect(moved.text.replace(/\s+/g, " ")).toBe(long);
  expect(moved.text).toContain("\n");
  expect(moved.bounds.x + moved.bounds.width).toBeLessThanOrEqual(
    next.display.cropRight,
  );
});

function editWrapped(
  store: Awaited<ReturnType<typeof typedNearBottom>>["store"],
  runId: string,
  text: string,
) {
  const run = store.document!.page(0).findRun(runId)!;
  const before = runBottom(run);
  store.dispatch(new EditTextCommand({ pageIndex: 0, runId, nextText: text }));
  store.dispatch(
    new ReflowWrapCommand({ pageIndex: 0, runId, maxWidthPt: 120 }),
  );
  return flowPastBottom(store, 0, runId, before);
}

test("a wrapped paragraph that flows again rejoins its continuation with a space", async () => {
  const { store, runId } = await typedNearBottom();
  const words = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => `w${from + i}`).join(" ");
  expect(editWrapped(store, runId, words(0, 30))).toBe("moved");
  const doc = store.document!;
  const source = doc.page(0).findRun(runId)!;
  const continuation = doc.page(1).runs[0].text;
  const flat = (text: string) => text.replace(/\s+/g, " ");
  expect(`${flat(source.text)} ${flat(continuation)}`).toBe(words(0, 30));

  const kept = flat(source.text);
  expect(editWrapped(store, runId, `${kept} extra words here`)).toBe("moved");
  const sourceAfter = doc.page(0).findRun(runId)!.text;
  const continuationAfter = doc.page(1).runs[0].text;
  expect(continuationAfter).not.toContain(`\n${continuation.split("\n")[0]}`);
  expect(`${flat(sourceAfter)} ${flat(continuationAfter)}`).toBe(
    `${kept} extra words here ${flat(continuation)}`,
  );
});
