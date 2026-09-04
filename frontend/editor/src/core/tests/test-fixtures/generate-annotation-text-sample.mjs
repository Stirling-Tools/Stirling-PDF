import process from "node:process";
// One-off script: generate `annotation-text-sample.pdf`, a page that carries
// BOTH editable page text and text that only exists inside annotations
// (a FreeText annotation and a form-field widget).
//
// The editor renders with FPDF_ANNOT but walks page objects only, so the
// annotation text is visible and uneditable. This fixture lets the outline +
// tooltip affordance be regression-tested.
//
// Run with: node generate-annotation-text-sample.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PDFName,
  PDFString,
} from "@cantoo/pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);

  // Ordinary page text - this IS editable.
  page.drawText("Editable page text", {
    x: 30,
    y: 250,
    size: 16,
    font: helv,
    color: rgb(0, 0, 0),
  });

  // A form-field widget: annotation-backed, not page text.
  const form = doc.getForm();
  const field = form.createTextField("sample.field");
  field.setText("Widget field text");
  field.addToPage(page, {
    x: 30,
    y: 180,
    width: 220,
    height: 24,
    font: helv,
  });

  // A FreeText annotation: also annotation-backed, not page text.
  const freeText = doc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("FreeText"),
    Rect: [30, 110, 260, 140],
    Contents: PDFString.of("FreeText annotation body"),
    DA: PDFString.of("/Helv 12 Tf 0 g"),
    F: 4,
  });
  const ref = doc.context.register(freeText);
  const annots = page.node.Annots();
  if (annots) annots.push(ref);
  else page.node.set(PDFName.of("Annots"), doc.context.obj([ref]));

  const bytes = await doc.save();
  const out = join(__dirname, "annotation-text-sample.pdf");
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
