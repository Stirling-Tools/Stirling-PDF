import process from "node:process";
// One-off script: generate two probe fixtures.
//
//  shading-sample.pdf   - an axial gradient painted with the `sh` operator plus
//                         a pattern-filled rectangle, with ordinary text over
//                         both. Probes whether editing the text costs the page
//                         its background artwork.
//  justified-sample.pdf - text laid out with TJ arrays carrying inter-word
//                         offsets, the way justified copy is really emitted.
//                         Probes whether the reader invents extra spaces.
//
// Run with: node generate-shading-and-justified-sample.mjs
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

function rawStream(doc, body) {
  const bytes = new TextEncoder().encode(body);
  return doc.context.register(
    PDFRawStream.of(doc.context.obj({ Length: bytes.length }), bytes),
  );
}

async function makeShading() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 300]);
  const fontKey = page.node.newFontDictionaryKey("Helv");
  page.node.setFontDictionary(fontKey, helv.ref);

  // Axial shading, white -> mid grey across the page.
  const fn = doc.context.obj({
    FunctionType: 2,
    Domain: [0, 1],
    C0: [0.95, 0.95, 1],
    C1: [0.35, 0.55, 0.85],
    N: 1,
  });
  const shading = doc.context.obj({
    ShadingType: 2,
    ColorSpace: PDFName.of("DeviceRGB"),
    Coords: [0, 0, 420, 0],
    Function: doc.context.register(fn),
    Extend: [true, true],
  });
  const shadingRef = doc.context.register(shading);
  const resources = page.node.Resources();
  resources.set(PDFName.of("Shading"), doc.context.obj({ Sh0: shadingRef }));

  const body = [
    "q",
    "0 0 420 300 re W n",
    "/Sh0 sh",
    "Q",
    "BT /Helv 20 Tf 0 0 0 rg 34 210 Td (Text over a gradient) Tj ET",
    "BT /Helv 14 Tf 34 170 Td (Second line of body text) Tj ET",
    "",
  ].join("\n");
  page.node.set(PDFName.of("Contents"), rawStream(doc, body));

  const bytes = await doc.save();
  const out = join(__dirname, "shading-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
}

async function makeJustified() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 220]);
  const fontKey = page.node.newFontDictionaryKey("Helv");
  page.node.setFontDictionary(fontKey, helv.ref);

  // Justified copy: each inter-word gap is widened by a negative TJ number
  // rather than by a wider space glyph, which is what real justification emits.
  const line = (y, words, kern) =>
    `BT /Helv 13 Tf 30 ${y} Td [${words
      .map((w, i) => `(${w})${i < words.length - 1 ? ` ${kern}` : ""}`)
      .join(" ")}] TJ ET`;

  const body = [
    line(170, ["Justified", "copy", "spreads", "its", "words"], -420),
    line(145, ["across", "the", "measure", "using", "offsets"], -560),
    line(120, ["not", "by", "padding", "with", "spaces"], -300),
    "",
  ].join("\n");
  page.node.set(PDFName.of("Contents"), rawStream(doc, body));

  const bytes = await doc.save();
  const out = join(__dirname, "justified-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
}

async function main() {
  await makeShading();
  await makeJustified();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
