// One-off script: generate `many-pages-sample.pdf`, an 8-page PDF with two
// text lines per page. Eight is deliberately past the editor's
// EAGER_PAGE_LIMIT (5), so pages 6-8 carry no runs until something reads
// them - which is what makes it a fixture for "select all misses part of
// the document". Small enough to load in a test without a timeout.
//
// Run with: node generate-many-pages-sample.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PAGES = 8;
const LINES_PER_PAGE = 2;

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < PAGES; p++) {
    const page = doc.addPage([612, 792]);
    for (let l = 0; l < LINES_PER_PAGE; l++) {
      // Unique per line so a test can assert exactly which lines were hit.
      page.drawText(`Page ${p + 1} line ${l + 1}`, {
        x: 72,
        y: 700 - l * 40,
        size: 18,
        font,
        color: rgb(0, 0, 0),
      });
    }
  }
  const bytes = await doc.save();
  const out = join(__dirname, "many-pages-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes, ${PAGES} pages)`);
}

main();
