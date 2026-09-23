import process from "node:process";
// One-off script: generate `split-contents-sample.pdf`, a page whose /Contents
// is an ARRAY of streams split MID-OPERATOR - no member is independently valid
// PDF content, only their concatenation is. Acrobat Distiller emits this shape
// when a page's content exceeds its internal buffer.
//
// The spec defines a /Contents array as the concatenation of its members, so a
// reader must join them before tokenizing. The risk being probed is that an
// editor which regenerates only the member owning a dirty object turns the
// concatenation into operator soup.
//
// Run with: node generate-split-contents-sample.mjs
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

async function main() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([420, 260]);
  const fontKey = page.node.newFontDictionaryKey("Helv");
  page.node.setFontDictionary(fontKey, helv.ref);

  // Deliberately cut each operator sequence across the member boundary.
  const pieces = [
    "BT /Helv 18 Tf 40 200 Td (Split contents line one) Tj ET\nBT /Helv 18 Tf 40 1",
    "70 Td (Split contents line two) Tj ET\nBT /Helv 18 Tf 40 140 Td (Split cont",
    "ents line three) Tj ET\n",
  ];

  const refs = pieces.map((body) => {
    const stream = PDFRawStream.of(
      doc.context.obj({ Length: body.length }),
      new TextEncoder().encode(body),
    );
    return doc.context.register(stream);
  });
  page.node.set(PDFName.of("Contents"), doc.context.obj(refs));

  const bytes = await doc.save();
  const out = join(__dirname, "split-contents-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes, ${refs.length} members)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
