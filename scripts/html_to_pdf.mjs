/**
 * Converts an HTML file to an A4 PDF using Puppeteer/Chromium.
 * Usage: node html_to_pdf.mjs <input.html> <output.pdf>
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";

const [, , inputHtml, outputPdf] = process.argv;

if (!inputHtml || !outputPdf) {
  console.error("Usage: node html_to_pdf.mjs <input.html> <output.pdf>");
  process.exit(1);
}

// Resolve puppeteer from the frontend node_modules (already downloaded + has Chrome)
const require = createRequire(import.meta.url);
const puppeteerPath = new URL(
  "../frontend/node_modules/puppeteer/lib/cjs/puppeteer/puppeteer.js",
  import.meta.url
).pathname;
const { launch } = await import(
  pathToFileURL(
    resolve(
      new URL(".", import.meta.url).pathname,
      "../frontend/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js"
    )
  ).href
);

const browser = await launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ],
});

try {
  const page = await browser.newPage();
  const fileUrl = pathToFileURL(resolve(inputHtml)).href;

  await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 30000 });

  // Read CSS variables at runtime so theme colours apply outside <body>
  const pageMargin = await page.evaluate(
    () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--page-margin")
        .trim() || "20mm"
  );

  await page.pdf({
    path: outputPdf,
    format: "A4",
    printBackground: true,
    margin: {
      top: pageMargin,
      right: pageMargin,
      bottom: pageMargin,
      left: pageMargin,
    },
  });
} finally {
  await browser.close();
}
