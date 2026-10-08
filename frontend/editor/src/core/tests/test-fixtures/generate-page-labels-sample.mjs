// One-off script: generate `page-labels-sample.pdf`, a 6-page PDF whose
// `/PageLabels` number tree gives the first three pages lowercase roman
// (`i`,`ii`,`iii`) and the rest arabic from 1 (`1`,`2`,`3`). Real-world
// documents use this for front matter, so it is the fixture for "the viewer
// must show the document's own labels rather than sequential indices".
//
// `@cantoo/pdf-lib` cannot model page labels, so the tree is written straight
// into the catalog: `/Nums [0 << /S /r >> 3 << /S /D /St 1 >>]`.
//
// Run with: node generate-page-labels-sample.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFDocument, PDFName, StandardFonts, rgb } from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

const LABELS = ["i", "ii", "iii", "1", "2", "3"];

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of LABELS) {
    const page = doc.addPage([300, 400]);
    page.drawText(label, {
      x: 120,
      y: 180,
      size: 48,
      font,
      color: rgb(0, 0, 0),
    });
  }
  doc.catalog.set(
    PDFName.of("PageLabels"),
    doc.context.obj({
      Nums: [0, { S: PDFName.of("r") }, 3, { S: PDFName.of("D"), St: 1 }],
    }),
  );
  const bytes = await doc.save();
  const out = join(__dirname, "page-labels-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes, ${LABELS.length} pages)`);
}

main();
