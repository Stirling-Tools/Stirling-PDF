// Reproduces a merged label bridging two text bands in a five-column grid.
// Run with: node generate-merged-table-sample.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const xs = [36, 132, 321, 393, 473, 576];
const ys = [641, 607, 569, 515, 473, 431, 377, 339];
const spans = [
  { row: 1, col: 0, rowSpan: 1, colSpan: 2 },
  { row: 2, col: 0, rowSpan: 2, colSpan: 1 },
  { row: 6, col: 0, rowSpan: 1, colSpan: 3 },
];
const rows = [
  ["Workstream", "Task", "Owner", "State", "Hours"],
  ["North programme", "", "Ada", "Active", "18.5"],
  ["Ops", "Archive intake\nBox 01 to Box 12", "Lin", "Ready", "7.0"],
  ["", "Metadata review", "Sam", "Review", "12.5"],
  ["QA", "Needs sign-off", "Jo", "Hold", "4.0"],
  ["Docs", "Export proof\nKeep both lines", "May", "", "3.25"],
  ["Shared checkpoint", "", "", "Review", "45.25"],
];

const document = await PDFDocument.create();
const regular = await document.embedFont(StandardFonts.Helvetica);
const bold = await document.embedFont(StandardFonts.HelveticaBold);
const page = document.addPage([612, 792]);
const black = rgb(0, 0, 0);
page.drawText("Merged cells and multiple text runs", {
  x: 36,
  y: 721,
  font: bold,
  size: 23,
  color: black,
});
for (let c = 0; c < xs.length; c++) {
  for (let r = 0; r < rows.length; r++) {
    if (
      spans.some(
        (s) =>
          s.row <= r &&
          r < s.row + s.rowSpan &&
          s.col < c &&
          c < s.col + s.colSpan,
      )
    )
      continue;
    page.drawLine({
      start: { x: xs[c], y: ys[r + 1] },
      end: { x: xs[c], y: ys[r] },
      thickness: 0.8,
      color: black,
    });
  }
}
for (let r = 0; r < ys.length; r++) {
  for (let c = 0; c < xs.length - 1; c++) {
    if (
      spans.some(
        (s) =>
          s.row < r &&
          r < s.row + s.rowSpan &&
          s.col <= c &&
          c < s.col + s.colSpan,
      )
    )
      continue;
    page.drawLine({
      start: { x: xs[c], y: ys[r] },
      end: { x: xs[c + 1], y: ys[r] },
      thickness: 0.8,
      color: black,
    });
  }
}
for (const [r, row] of rows.entries()) {
  for (const [c, text] of row.entries()) {
    if (!text) continue;
    const span = spans.find((s) => s.row === r && s.col === c);
    const font = r === 0 ? bold : regular;
    const lines = text.split("\n");
    let y =
      (ys[r] + ys[r + (span?.rowSpan ?? 1)]) / 2 -
      3.85 +
      (lines.length - 1) * 7;
    for (const line of lines) {
      const x =
        c === 4 && r > 0
          ? xs[c + 1] - 10 - font.widthOfTextAtSize(line, 11)
          : xs[c] + 10;
      if (r === 4 && c === 1) {
        page.drawText("Needs ", {
          x,
          y,
          font: regular,
          size: 11,
          color: black,
        });
        page.drawText("sign-off", {
          x: x + regular.widthOfTextAtSize("Needs ", 11),
          y,
          font: bold,
          size: 11,
          color: black,
        });
      } else {
        page.drawText(line, { x, y, font, size: 11, color: black });
      }
      y -= 14;
    }
  }
}
writeFileSync(
  path.join(import.meta.dirname, "merged-table-sample.pdf"),
  await document.save(),
);
