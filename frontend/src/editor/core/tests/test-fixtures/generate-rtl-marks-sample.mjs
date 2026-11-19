// One-off script: generate `rtl-marks-sample.pdf`, a Hebrew line with niqqud and
// an Arabic line with tashkeel, printed by Chromium with embedded subsets of
// Noto Sans Hebrew and Noto Sans Arabic (both SIL OFL).
//
// Run with: node generate-rtl-marks-sample.mjs
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
${face("Hebrew", "NotoSansHebrew-Regular.ttf")}
${face("Arabic", "NotoSansArabic-Regular.ttf")}
body { margin: 48px; font: 20px "Hebrew", "Arabic"; }
p { margin: 0 0 28px; }
</style></head><body>
<p dir="rtl">שָׁלוֹם עוֹלָם</p>
<p dir="rtl">يُولَدُ جَمِيعُ النَّاسِ</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const bytes = await page.pdf({ format: "A6" });
await browser.close();
const out = join(__dirname, "rtl-marks-sample.pdf");
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
