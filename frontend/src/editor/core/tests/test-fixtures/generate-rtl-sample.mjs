// One-off script: generate `rtl-sample.pdf`, a right-to-left Hebrew line and a
// left-to-right line with a Hebrew word in it, printed by Chromium with
// embedded subsets of Noto Sans Hebrew and Liberation Sans (both SIL OFL).
//
// Run with: node generate-rtl-sample.mjs
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
body { margin: 48px; font: 16px "Latin", "Hebrew"; }
p { margin: 0 0 24px; }
</style></head><body>
<p dir="rtl">שלום עולם וברוכים הבאים</p>
<p>Mixed: hello שלום world 123.</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const bytes = await page.pdf({ format: "A4" });
await browser.close();
const out = join(__dirname, "rtl-sample.pdf");
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
