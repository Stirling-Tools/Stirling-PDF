// Generates `scanned-ocr-receipt.pdf`: a web receipt printed with its text
// turned into outlines, the way Microsoft Print To PDF prints a web page, then
// OCR'd by ocrmypdf 17. Small text with a web page's loose leading, a bordered
// table of labels and values, and a footer address whose first line starts with
// narrow letters, so OCR reports that line far smaller than the rest.
//
// Needs Ghostscript and ocrmypdf on PATH. Run with:
// node generate-scanned-ocr-receipt.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 300pt 400pt; margin: 0 }
body { margin: 18pt 20pt; font-family: Arial, Helvetica, sans-serif; color: #000; }
h1 { font-size: 13pt; margin: 0 0 8pt }
p { font-size: 5.5pt; line-height: 10pt; margin: 0 0 9pt; width: 250pt }
table { border-collapse: collapse; font-size: 7.5pt; margin: 4pt 0 12pt; width: 260pt }
td { border: 0.75pt solid #000; padding: 3pt 4pt; }
.footer { font-size: 4.5pt; line-height: 7pt; margin-top: 14pt }
</style></head><body>
<h1>Payment receipt</h1>
<p>Thank you for your order. This receipt confirms the payment we received for the items listed below and can be kept for your records.</p>
<table>
<tr><td>Order number</td><td>Northwind 88213</td></tr>
<tr><td>Payment date</td><td>Monday 3 March</td></tr>
<tr><td>Payment method</td><td>Visa ending 4417</td></tr>
<tr><td>Amount paid</td><td>Forty two pounds</td></tr>
</table>
<p>Questions about this payment can be sent to our support team, who will reply within two working days of receiving your message.</p>
<div class="footer">Il Forno Trading Limited<br>Iliffe House, Unit 4<br>Kingsway Road, Bristol<br>United Kingdom BS1 6QA<br>Registered in England 0458812</div>
</body></html>`;

const work = mkdtempSync(join(tmpdir(), "ocr-receipt-"));
try {
  const source = join(work, "receipt.html");
  const printed = join(work, "printed.pdf");
  const outlined = join(work, "outlined.pdf");
  writeFileSync(source, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${source}`);
  await page.pdf({ path: printed, preferCSSPageSize: true });
  await browser.close();
  execFileSync("gs", [
    "-q",
    "-dNOPAUSE",
    "-dBATCH",
    "-sDEVICE=pdfwrite",
    "-dNoOutputFonts",
    "-o",
    outlined,
    printed,
  ]);
  execFileSync("ocrmypdf", [
    "-q",
    "-l",
    "eng",
    "--output-type",
    "pdf",
    outlined,
    join(here, "scanned-ocr-receipt.pdf"),
  ]);
} finally {
  rmSync(work, { recursive: true, force: true });
}
