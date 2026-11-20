// One-off script: generate `coloured-word-sample.pdf`, one paragraph of black
// Liberation Sans with blue bold words, one ending a line and one mid-line,
// a single line below it with a blue bold word, and a Hebrew line with a blue
// word, printed by Chromium so each styled word is its own object.
// Liberation Sans and Noto Sans Hebrew (SIL OFL) keep the embedded fonts
// redistributable.
//
// Run with: node generate-coloured-word-sample.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS = join(
  __dirname,
  "../../../../../../app/core/src/main/resources/static/fonts",
);
const face = (weight, file, family = "Liberation Sans") =>
  `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/ttf;base64,${readFileSync(join(FONTS, file)).toString("base64")}); }`;

const html = `<!doctype html><html><head><style>
${face(400, "LiberationSans-Regular.ttf")}
${face(700, "LiberationSans-Bold.ttf")}
${face(400, "NotoSansHebrew-Regular.ttf", "Hebrew")}
body { margin: 48px; font: 14px/20px "Liberation Sans"; color: #000; }
b, .blue { color: #1040d8; }
</style></head><body>
<p>Our office in the city centre is open daily<br>
Glasgow and the west of <b>Scotland</b><br>
call the <b>Helpdesk</b> team before noon<br>
or write to us at the Harbour Street office</p>
<p style="margin-top: 40px">Total due <b>today</b> by card</p>
<p dir="rtl" style="margin-top: 40px; font-family: Hebrew">הטלפון <span class="blue">שלום</span> והמחיר</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const bytes = await page.pdf({ width: "420px", height: "330px" });
await browser.close();
const out = join(__dirname, "coloured-word-sample.pdf");
writeFileSync(out, bytes);
console.log(`wrote ${out} (${bytes.length} bytes)`);
