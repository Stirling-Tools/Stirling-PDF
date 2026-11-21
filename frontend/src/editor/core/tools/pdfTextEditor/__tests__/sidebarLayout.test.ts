// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { GroupingMode } from "@editor/tools/pdfTextEditor/types";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { detectTables } from "@editor/tools/pdfTextEditor/util/tableDetection";
import {
  FIXTURES,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();

const opened: EditorDocument[] = [];

afterEach(() => {
  for (const doc of opened.splice(0)) doc.dispose();
});

async function tablesIn(mode: GroupingMode) {
  const bytes = await readFile(
    path.join(FIXTURES, "sidebar-resume-sample.pdf"),
  );
  const doc = await EditorDocument.open(new Uint8Array(bytes));
  opened.push(doc);
  const page = doc.page(0);
  PdfiumTextReader.populate(doc, page, mode);
  return detectTables(
    page.runs.map((run) => run.snapshot()),
    0,
    {},
    page.rules,
  );
}

test.each<GroupingMode>(["auto", "line"])(
  "reads a sidebar beside a column of sections as page layout, not a table (%s)",
  async (mode) => {
    expect(await tablesIn(mode)).toEqual([]);
  },
);
