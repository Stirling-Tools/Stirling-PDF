// One-off script: generate `shaped-line-sample.pdf`, a Devanagari line ending
// in Latin punctuation and digits, printed by Chromium with embedded subsets of
// Noto Sans Devanagari and Liberation Sans (both SIL OFL). Its conjuncts and
// vowel signs are single shaped glyphs, which no other font can stand in for.
//
// Run with: node generate-shaped-line-sample.mjs
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
${face("Devanagari", "NotoSansDevanagari-Regular.ttf")}
body { margin: 48px; font: 20px "Latin", "Devanagari"; }
p { margin: 0; }
</style></head><body>
<p>नमस्ते दुनिया, 2024.</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const bytes = await page.pdf({ format: "A6" });
await browser.close();
const out = join(__dirname, "shaped-line-sample.pdf");
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
