import process from "node:process";
// One-off script: generate `form-xobject-sample.pdf`, a synthetic
// magazine-style PDF whose page content lives inside a Form XObject.
// This mirrors the structural pattern InDesign / professional layout
// tools emit (e.g. PC Magazin issues) so the editor's recursive text
// extractor can be regression-tested without shipping a copyrighted
// binary fixture.
//
// Run with: node generate-form-xobject-sample.mjs
//
// The output is checked into test-fixtures/ and consumed by
// pdf-text-editor-v2.spec.ts under the "form xobject recursion" group.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const srcDoc = await PDFDocument.create();
  const helv = await srcDoc.embedFont(StandardFonts.Helvetica);
  const srcPage = srcDoc.addPage([400, 200]);
  srcPage.drawText("Magazine cover title", {
    x: 30,
    y: 150,
    size: 24,
    font: helv,
    color: rgb(0, 0, 0),
  });
  srcPage.drawText("Subheading line below", {
    x: 30,
    y: 110,
    size: 14,
    font: helv,
    color: rgb(0.2, 0.2, 0.2),
  });
  srcPage.drawText("Inner body paragraph one.", {
    x: 30,
    y: 80,
    size: 11,
    font: helv,
    color: rgb(0, 0, 0),
  });
  srcPage.drawText("Inner body paragraph two.", {
    x: 30,
    y: 60,
    size: 11,
    font: helv,
    color: rgb(0, 0, 0),
  });
  const srcBytes = await srcDoc.save();

  const dstDoc = await PDFDocument.create();
  const [embedded] = await dstDoc.embedPdf(srcBytes);
  const dstPage = dstDoc.addPage([400, 200]);
  dstPage.drawPage(embedded, { x: 0, y: 0, width: 400, height: 200 });
  const out = await dstDoc.save();

  const target = join(__dirname, "form-xobject-sample.pdf");
  writeFileSync(target, out);
  console.log(`wrote ${target} (${out.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
