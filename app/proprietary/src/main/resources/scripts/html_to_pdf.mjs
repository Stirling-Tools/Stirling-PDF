/**
 * Converts an HTML file to an A4 PDF using Puppeteer/Chromium.
 * Usage: node html_to_pdf.mjs <input.html> <output.pdf>
 *
 * Puppeteer is resolved from the frontend node_modules when running in dev,
 * or from the Docker venv path in production. The PUPPETEER_MODULE_PATH
 * environment variable overrides the default resolution order.
 */

import { resolve, dirname } from "path";
import { pathToFileURL, fileURLToPath } from "url";
import { existsSync } from "fs";

const [, , inputHtml, outputPdf] = process.argv;

if (!inputHtml || !outputPdf) {
  console.error("Usage: node html_to_pdf.mjs <input.html> <output.pdf>");
  process.exit(1);
}

async function loadPuppeteer() {
  // 1. Explicit override via env var
  if (process.env.PUPPETEER_MODULE_PATH) {
    return (await import(pathToFileURL(process.env.PUPPETEER_MODULE_PATH).href)).default;
  }

  // 2. Candidates relative to common project layouts (dev: frontend/node_modules, Docker: /usr/lib/node_modules)
  const candidates = [
    resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/node_modules/puppeteer"),
    "/usr/lib/node_modules/puppeteer",
    "/usr/local/lib/node_modules/puppeteer",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return (await import(pathToFileURL(resolve(candidate, "lib/esm/puppeteer/puppeteer.js")).href)).default;
    }
  }

  throw new Error("Puppeteer not found. Set PUPPETEER_MODULE_PATH or install puppeteer.");
}

const puppeteer = await loadPuppeteer();

const browser = await puppeteer.launch({
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
