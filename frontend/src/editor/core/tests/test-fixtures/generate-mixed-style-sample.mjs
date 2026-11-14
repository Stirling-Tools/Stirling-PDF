// One-off script: generate `mixed-style-sample.pdf`, lines that switch between
// regular, bold, italic and bold italic mid-line, a symbols line and a line
// with subscripts and superscripts, printed by Chromium so each styled word is
// its own object in an embedded subset font.
// Liberation Sans (SIL OFL) keeps the embedded fonts redistributable.
//
// Run with: node generate-mixed-style-sample.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS = join(
  __dirname,
  "../../../../../../app/core/src/main/resources/static/fonts",
);
const face = (weight, style, file) =>
  `@font-face { font-family: "Liberation Sans"; font-weight: ${weight}; font-style: ${style}; src: url(data:font/ttf;base64,${readFileSync(join(FONTS, file)).toString("base64")}); }`;

const html = `<!doctype html><html><head><style>
${face(400, "normal", "LiberationSans-Regular.ttf")}
${face(700, "normal", "LiberationSans-Bold.ttf")}
${face(400, "italic", "LiberationSans-Italic.ttf")}
${face(700, "italic", "LiberationSans-BoldItalic.ttf")}
body { margin: 48px; font: 16px "Liberation Sans"; }
p { margin: 0 0 14px; }
</style></head><body>
<p>Plain <b>bold</b> and <i>italic</i> and <b><i>both</i></b> in one line.</p>
<p>Total due: <b>1,250.00 EUR</b> by Friday.</p>
<p>Ratio a ≥ b → c, done ✓ today.</p>
<p style="margin: 160px 0 0 140px">Note: <b>urgent</b> reply <i>needed</i> soon.</p>
<p style="margin: 120px 0 0">Water is H<sub>2</sub>O and area is x<sup>2</sup> plus y<sup>3</sup>.</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const bytes = await page.pdf({ format: "A4" });
await browser.close();
const out = join(__dirname, "mixed-style-sample.pdf");
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
