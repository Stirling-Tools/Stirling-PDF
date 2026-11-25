// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { GroupingMode } from "@editor/tools/pdfTextEditor/types";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { detectTables } from "@editor/tools/pdfTextEditor/util/tableDetection";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/two-column-sample.pdf",
);
const GUTTER = { left: 296.5, right: 305.5 };

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

async function read(pageIndex: number, mode: GroupingMode) {
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  const page = doc.page(pageIndex);
  PdfiumTextReader.populate(doc, page, mode);
  return page;
}

function crossesGutter(run: { bounds: { x: number; width: number } }) {
  return (
    run.bounds.x < GUTTER.right && run.bounds.x + run.bounds.width > GUTTER.left
  );
}

test("reads each column's lines apart at a gutter narrower than the widest word gap", async () => {
  const page = await read(0, "line");
  const body = page.runs.filter((run) => !/regional council/.test(run.text));

  expect(body.filter(crossesGutter).map((run) => run.text)).toEqual([]);
  expect(body.map((run) => run.text)).toContain(
    "Northern ferries carry freight between the islands",
  );
  expect(body.map((run) => run.text)).toContain(
    "Village councils meet each month to plan repairs to",
  );
});

test("groups each column into paragraphs of its own", async () => {
  const page = await read(0, "auto");
  const body = page.runs.filter((run) => !/regional council/.test(run.text));

  expect(body.filter(crossesGutter).map((run) => run.text)).toEqual([]);
  expect(body.map((run) => run.text.replace(/\s+/g, " "))).toEqual(
    expect.arrayContaining([
      "Northern ferries carry freight between the islands every morning and return with the mail before the harbour closes for the night.",
      "Village councils meet each month to plan repairs to the piers, the lighthouse and the narrow roads that link the farms to the quay.",
    ]),
  );
});

test("finds no table in a page of two columns", async () => {
  const page = await read(0, "line");

  expect(
    detectTables(
      page.runs.map((run) => run.snapshot()),
      0,
      {},
      page.rules,
    ),
  ).toEqual([]);
});

test("keeps a running header on one line with the page number set beside it", async () => {
  const page = await read(0, "line");

  expect(page.runs.map((run) => run.text)).toContain(
    "Island transport survey, second interim report to the regional council  1",
  );
});

test("keeps justified words saved one object each on their lines, however wide their gaps", async () => {
  const page = await read(1, "line");

  expect(page.runs.slice(0, 5).map((run) => run.text)).toEqual([
    "Every word of this paragraph is its own",
    "object, spread across the measure with gaps",
    "as wide as a narrow column gutter so",
    "only the page layout can say which gap",
    "is a gutter and which is a word space.",
  ]);
});

test("keeps short labels on one line with their values a tab stop away", async () => {
  const page = await read(1, "line");

  expect(
    page.runs.slice(5).map((run) => run.text.replace(/\s+/g, " ")),
  ).toEqual([
    "Name: Jana Novak, harbour office of the northern islands",
    "Room: Freight bookings and passenger timetables for summer",
    "Email: Crossing schedules and the second revision of fares",
    "Code: Extension two hundred and eleven during office hours",
    "Name: Tomas Berg, weather desk and the morning radio report",
  ]);
});
