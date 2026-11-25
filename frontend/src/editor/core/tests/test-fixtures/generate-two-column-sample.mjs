import process from "node:process";
// One-off script: generate `two-column-sample.pdf`.
//
//  Page 1 - justified text in two columns 10pt apart, one Tj per line the way
//           TeX sets it, under a running header with its page number set
//           right beside it. The gutter is narrower than the widest gap a line
//           may hold, so only its alignment down the page tells it apart.
//  Page 2 - one column, each word its own object the way word processors save
//           justified text, with word gaps as wide as that gutter; and a list
//           of short labels with their values a tab stop away.
//
// Run with: node generate-two-column-sample.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
} from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIZE = 10;
const LEADING = 12;
const COLUMN_WIDTH = 240;
const LEFT_X = 56;
const RIGHT_X = LEFT_X + COLUMN_WIDTH + 10;
const TOP = 720;

const LEFT_TEXT = [
  "Northern ferries carry freight between the islands every morning and return with the mail before the harbour closes for the night.",
  "Weather reports arrive by radio at dawn, and the captains decide together whether the crossing is safe enough for the smaller boats.",
];
const RIGHT_TEXT = [
  "Village councils meet each month to plan repairs to the piers, the lighthouse and the narrow roads that link the farms to the quay.",
  "Visitors in summer double the population, so the councils publish timetables early and ask the bakeries to open their doors sooner.",
];

const LABELS = [
  ["Name:", "Jana Novak, harbour office of the northern islands"],
  ["Room:", "Freight bookings and passenger timetables for summer"],
  ["Email:", "Crossing schedules and the second revision of fares"],
  ["Code:", "Extension two hundred and eleven during office hours"],
  ["Name:", "Tomas Berg, weather desk and the morning radio report"],
];
const LABEL_TAB = 37.5;

const JUSTIFIED = [
  ["Every", "word", "of", "this", "paragraph", "is", "its", "own"],
  ["object,", "spread", "across", "the", "measure", "with", "gaps"],
  ["as", "wide", "as", "a", "narrow", "column", "gutter", "so"],
  ["only", "the", "page", "layout", "can", "say", "which", "gap"],
  ["is", "a", "gutter", "and", "which", "is", "a", "word", "space."],
];
const JUSTIFIED_WIDTH = 220;

function escape(text) {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

function wrap(font, text, width) {
  const lines = [];
  let line = [];
  for (const word of text.split(" ")) {
    const next = [...line, word].join(" ");
    if (line.length > 0 && font.widthOfTextAtSize(next, SIZE) > width) {
      lines.push(line);
      line = [word];
    } else line.push(word);
  }
  lines.push(line);
  return lines;
}

function column(font, paragraphs, x) {
  const ops = [];
  let y = TOP;
  for (const paragraph of paragraphs) {
    const lines = wrap(font, paragraph, COLUMN_WIDTH);
    lines.forEach((words, i) => {
      const text = words.join(" ");
      const last = i === lines.length - 1;
      const spare = COLUMN_WIDTH - font.widthOfTextAtSize(text, SIZE);
      const tw = last ? 0 : spare / (words.length - 1);
      ops.push(
        `BT /F1 ${SIZE} Tf ${tw.toFixed(3)} Tw ${x} ${y} Td (${escape(text)}) Tj ET`,
      );
      y -= LEADING;
    });
    y -= LEADING;
  }
  return ops;
}

function rawStream(doc, body) {
  const bytes = new TextEncoder().encode(body);
  return doc.context.register(
    PDFRawStream.of(doc.context.obj({ Length: bytes.length }), bytes),
  );
}

function addPage(doc, font, ops) {
  const page = doc.addPage([612, 792]);
  page.node.setFontDictionary(PDFName.of("F1"), font.ref);
  page.node.set(PDFName.of("Contents"), rawStream(doc, ops.join("\n")));
}

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const header =
    "Island transport survey, second interim report to the regional council";
  const headerRight = RIGHT_X + COLUMN_WIDTH;
  const number = "1";
  const numberX = headerRight - font.widthOfTextAtSize(number, SIZE);
  const headerX = numberX - 8 - font.widthOfTextAtSize(header, SIZE);
  addPage(doc, font, [
    `BT /F1 ${SIZE} Tf ${headerX.toFixed(2)} 750 Td (${escape(header)}) Tj ET`,
    `BT /F1 ${SIZE} Tf ${numberX.toFixed(2)} 750 Td (${number}) Tj ET`,
    ...column(font, LEFT_TEXT, LEFT_X),
    ...column(font, RIGHT_TEXT, RIGHT_X),
  ]);

  const second = [];
  let y = TOP;
  for (const words of JUSTIFIED) {
    const inked = words.reduce(
      (sum, word) => sum + font.widthOfTextAtSize(word, SIZE),
      0,
    );
    const gap = (JUSTIFIED_WIDTH - inked) / (words.length - 1);
    let x = LEFT_X;
    for (const word of words) {
      second.push(
        `BT /F1 ${SIZE} Tf ${x.toFixed(2)} ${y} Td (${escape(word)}) Tj ET`,
      );
      x += font.widthOfTextAtSize(word, SIZE) + gap;
    }
    y -= LEADING;
  }
  y -= 2 * LEADING;
  for (const [label, value] of LABELS) {
    second.push(`BT /F1 ${SIZE} Tf ${LEFT_X} ${y} Td (${escape(label)}) Tj ET`);
    second.push(
      `BT /F1 ${SIZE} Tf ${LEFT_X + LABEL_TAB} ${y} Td (${escape(value)}) Tj ET`,
    );
    y -= LEADING;
  }
  addPage(doc, font, second);

  const bytes = await doc.save({ useObjectStreams: false });
  const out = join(__dirname, "two-column-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
