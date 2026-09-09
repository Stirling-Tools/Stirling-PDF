// Render each .tab-section of a montage HTML into its own PNG (the PR-ready image).
// Run from frontend/editor (so @playwright/test resolves):
//   node <skill>/shoot-sections.mjs <montage.html> <outDir>
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "noop.js"));
const { chromium } = require("@playwright/test");

const htmlPath = path.resolve(process.argv[2]);
const outDir = path.resolve(process.argv[3] || path.dirname(htmlPath));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await page.waitForTimeout(250); // let images/fonts paint
const ids = await page.$$eval(".tab-section", (els) => els.map((e) => e.id));
if (!ids.length) { console.error("no .tab-section found"); process.exit(1); }
for (const id of ids) {
  const name = id.replace(/^section-/, "");
  await page.locator("#" + id).screenshot({ path: path.join(outDir, `montage_${name}.png`) });
  console.log("wrote montage_" + name + ".png");
}
await browser.close();
