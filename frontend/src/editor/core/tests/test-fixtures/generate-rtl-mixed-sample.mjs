// One-off script: generate `rtl-mixed-sample.pdf`, lines that mix directions:
// Arabic and Hebrew holding numbers, Latin words and brackets, an English line
// quoting both, and a right-to-left paragraph that opens with a Latin word.
// Printed by Chromium with embedded subsets of Liberation Sans, Noto Sans
// Hebrew and Noto Sans Arabic (all SIL OFL). Chromium draws the Arabic one
// glyph per text object and the Latin, Hebrew and numbers a word or more per
// object, so the file holds both shapes.
//
// Run with: node generate-rtl-mixed-sample.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS = join(
  __dirname,
  "../../../../../../app/core/src/main/resources/static/fonts",
);
const face = (family, file) =>
  `@font-face { font-family: "${family}"; src: url(data:font/ttf;base64,${readFileSync(join(FONTS, file)).toString("base64")}); }`;

const html = `<!doctype html><html><head><style>
${face("Latin", "LiberationSans-Regular.ttf")}
${face("Hebrew", "NotoSansHebrew-Regular.ttf")}
${face("Arabic", "NotoSansArabic-Regular.ttf")}
body { margin: 48px; font: 14px "Latin", "Hebrew", "Arabic"; }
p { margin: 0 0 22px; }
</style></head><body>
<p dir="rtl">بلغ الاستهلاك (في الربع) 12,450.75 كيلوواط [بزيادة 3.5%] حسب تقرير ISO 50001</p>
<p dir="rtl">استخدم برنامج LibreOffice Writer أو Word لفتح report-2026.docx الآن.</p>
<p dir="rtl">הטלפון הוא 03-555-1234 (שלוחה 12), והמחיר 1,299.90 לפי Open Source סעיף 4.</p>
<p>An English line quoting مرحبا بالعالم and שלום עולם then 1,234.</p>
<p dir="rtl">ISO 50001 هو المعيار</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const bytes = await page.pdf({ format: "A4" });
await browser.close();
const out = join(__dirname, "rtl-mixed-sample.pdf");
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
