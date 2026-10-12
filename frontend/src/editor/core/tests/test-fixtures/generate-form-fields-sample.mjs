// One-off script: generate `form-fields-sample.pdf`, a small two-page
// AcroForm fixture with one text field and one checkbox per page, so the
// viewer's form-apply reload path can be tested without a large fixture.
//
// Run with: node generate-form-fields-sample.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const form = doc.getForm();

for (let index = 0; index < 2; index++) {
  const page = doc.addPage([612, 792]);
  page.drawText(`Form page ${index + 1}`, {
    x: 48,
    y: 700,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  });

  const text = form.createTextField(`name_${index + 1}`);
  text.setText(`value ${index + 1}`);
  text.addToPage(page, { x: 48, y: 640, width: 300, height: 24 });

  const check = form.createCheckBox(`agree_${index + 1}`);
  check.addToPage(page, { x: 48, y: 600, width: 18, height: 18 });
}

const bytes = await doc.save();
const out = join(here, "form-fields-sample.pdf");
writeFileSync(out, bytes);
console.log(`${out}: ${(bytes.length / 1024).toFixed(1)} KB`);
