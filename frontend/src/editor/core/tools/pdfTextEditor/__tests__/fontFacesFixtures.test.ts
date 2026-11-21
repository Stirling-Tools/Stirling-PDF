// @vitest-environment node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { parseFaceName } from "@editor/tools/pdfTextEditor/util/faceNames";
import { documentFontIds } from "@editor/tools/pdfTextEditor/util/documentFontStyle";
import {
  documentFamilies,
  type FontFamilyEntry,
} from "@editor/tools/pdfTextEditor/util/fontFaces";
import {
  FIXTURES,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();

/** The document fonts on a fixture's first page as families, or null when it does not open. */
async function familiesOf(file: string): Promise<FontFamilyEntry[] | null> {
  let doc: EditorDocument;
  try {
    doc = await EditorDocument.open(
      new Uint8Array(await readFile(path.join(FIXTURES, file))),
    );
  } catch {
    return null;
  }
  try {
    PdfiumTextReader.populate(doc, doc.page(0));
    return documentFamilies([
      ...doc.page(0).runs.map((run) => run.fontId),
      ...documentFontIds(),
    ]);
  } finally {
    doc.dispose();
  }
}

function faces(entry: FontFamilyEntry | undefined) {
  return entry?.faces.map((f) => `${f.weight}${f.italic ? "i" : ""}`);
}

test("every fixture lists each family once, with no style left in its name", async () => {
  const files = (await readdir(FIXTURES)).filter((f) => f.endsWith(".pdf"));
  let opened = 0;
  for (const file of files) {
    const families = await familiesOf(file);
    if (!families) continue;
    opened++;
    const keys = families.map((entry) => entry.key);
    expect(new Set(keys).size, file).toBe(keys.length);
    for (const entry of families)
      expect(parseFaceName(entry.label).family, file).toBe(entry.label);
  }
  expect(opened).toBeGreaterThan(50);
}, 300_000);

test("the four Liberation Sans subsets of one paragraph are one family", async () => {
  const families = (await familiesOf("mixed-style-sample.pdf"))!;
  const liberation = families.find((e) => e.key === "liberationsans");
  expect(faces(liberation)).toEqual(["400", "700", "400i", "700i"]);
});

test("base-14 fonts the PDF does not embed are known by the name it gives them", async () => {
  const families = (await familiesOf("table-sample.pdf"))!;
  expect(families.map((e) => e.label)).toEqual(["Helvetica"]);
  expect(faces(families[0])).toEqual(["400", "700"]);
});

test("cairo's Georgia faces group and its bold-only Trebuchet stands for itself", async () => {
  const families = (await familiesOf("cairo-styles.pdf"))!;
  expect(faces(families.find((e) => e.key === "georgia"))).toEqual([
    "400",
    "700",
    "400i",
    "700i",
  ]);
  expect(faces(families.find((e) => e.key === "trebuchetms"))).toEqual(["700"]);
});
