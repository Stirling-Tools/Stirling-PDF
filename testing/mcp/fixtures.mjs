// Builds the correctness fixtures in memory, deterministically. `node fixtures.mjs <dir>` writes them out.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

import { PDFDocument, PDFHexString, PDFName, PageSizes, StandardFonts, rgb } from "@cantoo/pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const FONT = resolve(here, "../../app/core/src/main/resources/static/fonts/LiberationSans-Regular.ttf");
const FIXED_DATE = new Date("2026-01-01T00:00:00Z");

/** Words and tokens the checks look for; kept here so fixtures and assertions agree. */
export const EXPECT = {
  words: ["Stirling", "correctness", "harbour", "lighthouse"],
  secret: "SECRET-7Q4X-TOKEN",
  keep: "lighthouse",
  pageLabels: ["MARKER-ALPHA", "MARKER-BRAVO", "MARKER-CHARLIE", "MARKER-DELTA", "MARKER-ECHO"],
  sizes: { a4: PageSizes.A4, letter: PageSizes.Letter },
  ocrWords: ["invoice", "4821", "lighthouse", "harbour"],
  table: { header: ["Item", "Qty", "Price"], rows: [["Widget", "4", "12.50"], ["Gadget", "7", "3.25"], ["Sprocket", "11", "0.75"]] },
  chapters: ["Chapter One", "Chapter Two", "Chapter Three"],
  form: { text: "fullName", value: "Ada Lovelace", checkbox: "agree" },
};

async function newDoc(title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer("stirling-mcp-correctness");
  doc.setCreator("stirling-mcp-correctness");
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  return { doc, font: await doc.embedFont(StandardFonts.Helvetica) };
}

const save = (doc) => doc.save({ useObjectStreams: false });

async function textPdf() {
  const { doc, font } = await newDoc("Text fixture");
  const page = doc.addPage(PageSizes.A4);
  const lines = [
    "Stirling correctness fixture for the MCP regression suite.",
    "The harbour lighthouse guides ships home at night.",
    `Account reference ${EXPECT.secret} must never leak.`,
    "Closing line after the secret, kept intact by redaction.",
  ];
  lines.forEach((line, i) => page.drawText(line, { x: 72, y: 760 - i * 28, size: 14, font }));
  return save(doc);
}

async function pagesPdf() {
  const { doc, font } = await newDoc("Pages fixture");
  for (const label of EXPECT.pageLabels) {
    doc.addPage(PageSizes.A4).drawText(label, { x: 72, y: 760, size: 28, font });
  }
  return save(doc);
}

async function mixedSizesPdf() {
  const { doc, font } = await newDoc("Mixed sizes fixture");
  doc.addPage(EXPECT.sizes.a4).drawText("SIZE-A4 page", { x: 72, y: 700, size: 20, font });
  doc.addPage(EXPECT.sizes.letter).drawText("SIZE-LETTER page", { x: 72, y: 700, size: 20, font });
  return save(doc);
}

async function tablePdf() {
  const { doc, font } = await newDoc("Table fixture");
  const page = doc.addPage(PageSizes.A4);
  const cols = [72, 232, 332, 452];
  const rows = [EXPECT.table.header, ...EXPECT.table.rows];
  const top = 720;
  const h = 26;
  for (let r = 0; r <= rows.length; r++) {
    page.drawLine({ start: { x: cols[0], y: top - r * h }, end: { x: cols[3], y: top - r * h }, thickness: 1 });
  }
  for (const x of cols) page.drawLine({ start: { x, y: top }, end: { x, y: top - rows.length * h }, thickness: 1 });
  rows.forEach((row, r) => row.forEach((cell, c) => page.drawText(cell, { x: cols[c] + 6, y: top - (r + 1) * h + 8, size: 12, font })));
  return save(doc);
}

async function bookmarksPdf() {
  const { doc, font } = await newDoc("Bookmarks fixture");
  const pages = EXPECT.chapters.map((title) => {
    const page = doc.addPage(PageSizes.A4);
    page.drawText(title, { x: 72, y: 760, size: 24, font });
    return page;
  });
  const ctx = doc.context;
  const rootRef = ctx.nextRef();
  const refs = pages.map(() => ctx.nextRef());
  pages.forEach((page, i) => {
    const item = ctx.obj({ Title: PDFHexString.fromText(EXPECT.chapters[i]), Parent: rootRef, Dest: [page.ref, "Fit"] });
    if (i > 0) item.set(PDFName.of("Prev"), refs[i - 1]);
    if (i < refs.length - 1) item.set(PDFName.of("Next"), refs[i + 1]);
    ctx.assign(refs[i], item);
  });
  ctx.assign(rootRef, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: refs.length }));
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  return save(doc);
}

async function formPdf() {
  const { doc, font } = await newDoc("Form fixture");
  const page = doc.addPage(PageSizes.A4);
  page.drawText("Applicant form", { x: 72, y: 760, size: 18, font });
  const form = doc.getForm();
  const name = form.createTextField(EXPECT.form.text);
  name.setText(EXPECT.form.value);
  name.addToPage(page, { x: 72, y: 680, width: 260, height: 24, font });
  const agree = form.createCheckBox(EXPECT.form.checkbox);
  agree.addToPage(page, { x: 72, y: 640, width: 16, height: 16 });
  agree.check();
  return save(doc);
}

/** Truecolour PNG from an (x, y) -> [r, g, b] function, with no native dependencies. */
function encodePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length);
    head.write(type, 4, "latin1");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/** A photo-like, losslessly stored image that any real compressor can shrink. */
async function imageHeavyPdf() {
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const png = encodePng(900, 1200, (x, y) => {
    const n = (rand() - 0.5) * 24;
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v + n)));
    return [clamp(40 + x / 5), clamp(90 + y / 8), clamp(200 - (x + y) / 12)];
  });
  const { doc, font } = await newDoc("Image-heavy fixture");
  const page = doc.addPage(PageSizes.A4);
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  page.drawText("Image heavy fixture", { x: 72, y: 800, size: 14, font, color: rgb(1, 1, 1) });
  return save(doc);
}

/** Image-only page of rendered text, for OCR; null when @napi-rs/canvas is unavailable. */
async function scannedPdf() {
  let canvasLib;
  try {
    canvasLib = await import("@napi-rs/canvas");
  } catch {
    return null;
  }
  const { createCanvas, GlobalFonts } = canvasLib;
  GlobalFonts.registerFromPath(FONT, "FixtureSans");
  const canvas = createCanvas(1240, 1754);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000000";
  ctx.font = "56px FixtureSans";
  ["INVOICE 4821", "Lighthouse supplies", "Delivered to the harbour"].forEach((line, i) => ctx.fillText(line, 120, 220 + i * 110));
  const { doc } = await newDoc("Scanned fixture");
  const page = doc.addPage(PageSizes.A4);
  const img = await doc.embedPng(canvas.toBuffer("image/png"));
  page.drawImage(img, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  return save(doc);
}

/** name -> Uint8Array (or null when a fixture cannot be built on this machine). */
export async function buildFixtures() {
  return {
    "text.pdf": await textPdf(),
    "pages.pdf": await pagesPdf(),
    "mixed-sizes.pdf": await mixedSizesPdf(),
    "table.pdf": await tablePdf(),
    "bookmarks.pdf": await bookmarksPdf(),
    "form.pdf": await formPdf(),
    "image-heavy.pdf": await imageHeavyPdf(),
    "scanned.pdf": await scannedPdf(),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: node fixtures.mjs <output dir>");
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  for (const [name, bytes] of Object.entries(await buildFixtures())) {
    if (!bytes) {
      console.log(`skipped ${name} (needs @napi-rs/canvas)`);
      continue;
    }
    writeFileSync(join(out, name), bytes);
    console.log(`${name} ${bytes.length} bytes`);
  }
}
