// One-off script: generate `thai-line-sample.pdf`, a Thai line with no spaces
// between its words, printed by Chromium with an embedded subset of Noto Sans
// Thai (SIL OFL). Its vowel and tone marks are drawn as glyphs of their own,
// stacked over the letters they belong to.
//
// Run with: node generate-thai-line-sample.mjs
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
${face("Thai", "NotoSansThai-Regular.ttf")}
body { margin: 48px; font: 20px "Thai"; }
p { margin: 0; }
</style></head><body>
<p>มนุษย์ทั้งหลายเกิดมามีอิสระ</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const bytes = await page.pdf({ format: "A6" });
await browser.close();
const out = join(__dirname, "thai-line-sample.pdf");
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
