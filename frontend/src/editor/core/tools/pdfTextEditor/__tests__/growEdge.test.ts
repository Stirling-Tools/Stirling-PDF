// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import type { TextRunSnapshot } from "@editor/tools/pdfTextEditor/types";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { growEdge, growEdges } from "@editor/tools/pdfTextEditor/util/growEdge";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/two-column-sample.pdf",
);
const RIGHT_COLUMN_X = 306;
const GUTTER_LEFT = 296.5;

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
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page);
  return { doc, page };
}

const snapshots = (page: Page) => page.runs.map((run) => run.snapshot());

function rightColumn(page: Page) {
  return page.runs
    .filter((run) => run.bounds.x > GUTTER_LEFT)
    .map((run) => ({
      text: run.text,
      x: Math.round(run.bounds.x * 10) / 10,
      y: Math.round(run.bounds.y * 10) / 10,
    }));
}

function snapshot(
  id: string,
  x: number,
  width: number,
  text: string,
): TextRunSnapshot {
  return {
    id,
    pageIndex: 0,
    bounds: { x, y: 700, width, height: 10 },
    matrix: { a: 10, b: 0, c: 0, d: 10, e: x, f: 702 },
    text,
    fontId: "base14:Helvetica",
    fontSize: 10,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
  };
}

test("a left-column paragraph grows up to the column on its right, less a gap", async () => {
  const { page } = await open(new Uint8Array(await readFile(SAMPLE)));
  const runs = snapshots(page);
  const left = runs.find((run) => run.text.startsWith("Northern ferries"))!;

  const edge = growEdge(left, runs);

  expect(edge?.side).toBe("right");
  expect(edge!.x).toBeGreaterThan(left.bounds.x + left.bounds.width);
  expect(edge!.x).toBeLessThan(RIGHT_COLUMN_X);
});

test("text with nothing set beside it keeps the page edge", async () => {
  const { page } = await open(new Uint8Array(await readFile(SAMPLE)));
  const edges = growEdges(snapshots(page));

  for (const run of page.runs.filter(
    (run) => run.bounds.x > GUTTER_LEFT || run.text.includes("council"),
  ))
    expect(edges.get(run.id), run.text).toBeUndefined();
});

test("right-to-left text grows towards the text on its left", () => {
  const latin = snapshot("latin", 40, 100, "Total amount");
  const hebrew = snapshot("hebrew", 200, 80, "שלום עולם");

  expect(growEdge(hebrew, [latin, hebrew])).toEqual({ side: "left", x: 145 });
  expect(growEdge(latin, [latin, hebrew])).toEqual({ side: "right", x: 195 });
});

test("text on the lines above and below is no edge", () => {
  const run = snapshot("run", 40, 100, "A line of text");
  const above = {
    ...snapshot("above", 200, 80, "Above"),
    bounds: { x: 200, y: 711, width: 80, height: 10 },
  };

  expect(growEdge(run, [run, above])).toBeNull();
});

test("text wrapped at that edge leaves the right column as it was in the saved file", async () => {
  const { doc, page } = await open(new Uint8Array(await readFile(SAMPLE)));
  const before = rightColumn(page);
  const left = page.runs.find((run) =>
    run.text.startsWith("Northern ferries"),
  )!;
  const edge = growEdge(left.snapshot(), snapshots(page))!;
  const typed = left.text.replace(
    "the islands",
    "the islands with extra cargo",
  );

  new EditTextCommand({ pageIndex: 0, runId: left.id, nextText: typed }).apply(
    doc,
  );
  const wrap = new ReflowWrapCommand({
    pageIndex: 0,
    runId: left.id,
    maxWidthPt: edge.x - left.bounds.x,
    keepClearBelow: true,
  });
  wrap.apply(doc);
  expect(wrap.refusedForSpaceBelow).toBe(false);
  expect(rightColumn(page)).toEqual(before);

  const saved = await open(
    new Uint8Array(await (await exportToBlob(doc)).arrayBuffer()),
  );
  expect(rightColumn(saved.page)).toEqual(before);
  const reread = saved.page.runs.find((run) =>
    run.text.startsWith("Northern ferries"),
  )!;
  expect(reread.text.replace(/\s+/g, " ")).toContain(
    "the islands with extra cargo",
  );
  expect(reread.bounds.x + reread.bounds.width).toBeLessThan(GUTTER_LEFT);
});
