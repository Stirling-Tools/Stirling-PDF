/**
 * Log every request with its resource type and start time, to tell which of the duplicate
 * brand-asset fetches are initiator-driven (template link vs manifest vs apple-touch-icon).
 *
 * Run from frontend/editor: node tests/walkthrough/perf/probe-requests.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv.find((arg) => arg.startsWith("http")) ?? "http://localhost:4181/";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const start = Date.now();
const rows = [];
page.on("request", (request) => {
  rows.push({
    at: Date.now() - start,
    type: request.resourceType(),
    url: request.url().replace("http://localhost:4181", ""),
  });
});

await page.goto(url, { waitUntil: "load" });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1500);

for (const row of rows.sort((a, b) => a.at - b.at)) {
  console.log(`${String(row.at).padStart(5)}ms ${row.type.padEnd(10)} ${row.url}`);
}
const dupes = new Map();
for (const row of rows) dupes.set(row.url, (dupes.get(row.url) ?? 0) + 1);
console.log("\n-- repeated urls --");
for (const [u, n] of dupes) if (n > 1) console.log(`${n}x ${u}`);

await browser.close();
