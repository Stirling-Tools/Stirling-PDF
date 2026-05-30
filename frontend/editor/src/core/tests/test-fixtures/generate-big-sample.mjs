// One-off script: generate `big-sample.pdf`, a 40-page synthetic PDF
// with a few hundred text objects per page. Exercises the loading
// overlay (visible for several seconds on cold load) and the lazy
// page reader. Not heavy on disk (~ a few hundred KB) but heavy enough
// on parse + extract time to surface a UI freeze if one returns.
//
// Run with: node generate-big-sample.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const PAGES = 80;
  const LINES_PER_PAGE = 80;
  for (let p = 0; p < PAGES; p++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Page ${p + 1} of ${PAGES}`, {
      x: 50,
      y: 740,
      size: 22,
      font,
      color: rgb(0, 0, 0),
    });
    for (let l = 0; l < LINES_PER_PAGE; l++) {
      page.drawText(
        `Line ${l + 1} on page ${p + 1}: sample body content for paragraph clustering.`,
        {
          x: 50,
          y: 700 - l * 18,
          size: 11,
          font,
          color: rgb(0, 0, 0),
        },
      );
    }
  }
  const out = await doc.save();
  const target = join(__dirname, "big-sample.pdf");
  writeFileSync(target, out);
  console.log(`wrote ${target} (${out.length} bytes, ${PAGES} pages)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
