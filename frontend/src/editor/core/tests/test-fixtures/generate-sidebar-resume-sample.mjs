import process from "node:process";
// One-off script: generate `sidebar-resume-sample.pdf`, a résumé laid out as a
// shaded sidebar of short lines beside a column of headings, paragraphs and
// bullets, with no ruling lines. Table detection must read it as page layout.
//
// Run with: node generate-sidebar-resume-sample.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SIDEBAR = [
  ["Your Name", 22, true],
  ["Job title", 10],
  ["", 12],
  ["CONTACT", 9, true],
  ["you@example.com", 10],
  ["+1 555 0100", 10],
  ["City, Country", 10],
  ["", 12],
  ["SKILLS", 9, true],
  ["• Skill one", 11],
  ["• Skill two", 11],
  ["• Skill three", 11],
  ["", 12],
  ["LANGUAGES", 9, true],
  ["English, Spanish", 10],
];

const MAIN = [
  ["Profile", 13, true],
  ["Two or three sentences about who you are and the work you want", 11],
  ["next.", 11],
  ["Experience", 13, true],
  ["Job Title, Company", 11, true],
  ["2022 to present", 10],
  ["• What you did and the result it had", 11],
  ["• Another achievement with a number", 11],
  ["Job Title, Company", 11, true],
  ["2019 to 2022", 10],
  ["• What you did and the result it had", 11],
  ["Education", 13, true],
  ["Degree, University", 11, true],
  ["2015 to 2019", 10],
];

function column(page, fonts, lines, x, top) {
  let y = top;
  for (const [text, size, bold] of lines) {
    if (text) {
      page.drawText(text, {
        x,
        y: y - size,
        size,
        font: bold ? fonts.bold : fonts.regular,
        color: rgb(0.13, 0.13, 0.15),
      });
    }
    y -= size * 1.4 + (size >= 13 ? 6 : 0);
  }
}

async function main() {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const page = doc.addPage([595.28, 841.89]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: 202,
    height: 841.89,
    color: rgb(0.95, 0.96, 0.97),
  });
  column(page, fonts, SIDEBAR, 54, 768);
  column(page, fonts, MAIN, 229, 768);
  const out = join(__dirname, "sidebar-resume-sample.pdf");
  writeFileSync(out, await doc.save({ useObjectStreams: false }));
  process.stdout.write(`wrote ${out}\n`);
}

main();
