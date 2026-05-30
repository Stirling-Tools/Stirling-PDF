// One-off script: generate `paragraph-sample.pdf`, a synthetic PDF
// whose page contains a multi-line body paragraph with consistent
// font/size/colour/left-margin. ParagraphGrouper should fold all four
// lines into one editable block.
//
// Run with: node generate-paragraph-sample.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  const left = 30;
  const lineHeight = 16;
  let y = 260;
  page.drawText("Heading in a bigger size", {
    x: left,
    y,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });
  y -= 36;
  const bodyLines = [
    "First line of the body paragraph that we want grouped together.",
    "Second line continues the paragraph and shares the same font and",
    "left margin so the grouper recognises it as part of the block.",
    "Fourth line wraps the paragraph at the bottom of the column.",
  ];
  for (const text of bodyLines) {
    page.drawText(text, {
      x: left,
      y,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  }
  const out = await doc.save();
  const target = join(__dirname, "paragraph-sample.pdf");
  writeFileSync(target, out);
  console.log(`wrote ${target} (${out.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
