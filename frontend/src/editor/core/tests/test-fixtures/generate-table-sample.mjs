import process from "node:process";
// One-off script: generate `table-sample.pdf`, a borderless 4x3 grid of text
// with a right-aligned numeric column under a left-aligned header. There are no
// ruling lines, so detection has to find the grid from whitespace alone - the
// case that separates real table recognition from reading borders.
//
// Run with: node generate-table-sample.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

const HEADERS = ["Region", "2025", "2026"];
const ROWS = [
  ["EMEA", "812,400", "905,120"],
  ["North America", "1,204,000", "1,150,900"],
  ["APAC", "398,220", "441,000"],
];
// Column lefts for text, and right edges the numeric columns align against.
const LEFTS = [40, 190, 300];
const RIGHTS = [0, 270, 380];

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([420, 240]);
  const size = 10;
  let y = 190;

  page.drawText("Quarterly Results", {
    x: 40,
    y: 215,
    size: 14,
    font: bold,
    color: rgb(0, 0, 0),
  });

  HEADERS.forEach((text, c) => {
    page.drawText(text, {
      x: LEFTS[c],
      y,
      size,
      font: bold,
      color: rgb(0, 0, 0),
    });
  });
  y -= 22;

  for (const row of ROWS) {
    row.forEach((text, c) => {
      // Column 0 is left-aligned prose; the numeric columns are right-aligned,
      // so their lefts vary while the column band stays put.
      const x =
        c === 0 ? LEFTS[0] : RIGHTS[c] - font.widthOfTextAtSize(text, size);
      page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
    });
    y -= 22;
  }

  const out = await doc.save();
  const target = join(__dirname, "table-sample.pdf");
  writeFileSync(target, out);
  console.log(`wrote ${target} (${out.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
