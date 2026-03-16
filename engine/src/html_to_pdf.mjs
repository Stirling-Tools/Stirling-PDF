#!/usr/bin/env node

/**
 * Convert an HTML file to PDF using Puppeteer.
 *
 * Usage: node html_to_pdf.mjs <html_file_path> <pdf_output_path>
 *
 * Exit codes:
 *   0 – success
 *   1 – error (message printed to stderr)
 */

import puppeteer from 'puppeteer';
import { resolve } from 'path';
import { existsSync } from 'fs';

const [, , htmlFile, pdfFile] = process.argv;

if (!htmlFile || !pdfFile) {
  console.error('Usage: node html_to_pdf.mjs <html_file> <pdf_file>');
  process.exit(1);
}

const absoluteHtml = resolve(htmlFile);

if (!existsSync(absoluteHtml)) {
  console.error(`HTML file not found: ${absoluteHtml}`);
  process.exit(1);
}

async function convert() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();

    // Set viewport to A4 at 96dpi for accurate page sizing
    await page.setViewport({
      width: 794,
      height: 1123,
      deviceScaleFactor: 2,
    });

    await page.goto(`file://${absoluteHtml}`, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    // Wait a moment for any CSS transitions/fonts to settle
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Read computed CSS variable values after all styles have resolved.
    // @page rules cannot use var(), so we resolve them to literal values here.
    const themeBg = await page.evaluate(() => {
      const bg = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-bg')
        .trim();
      return bg || '#ffffff';
    });
    const pageMargin = await page.evaluate(() => {
      const margin = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-page-margin')
        .trim();
      return margin || '20mm';
    });

    // With preferCSSPageSize:true, Chromium treats CSS @page as authoritative for
    // ALL @page properties including margin. An @page rule with only `size` and
    // no `margin` is interpreted as margin:0, silently overriding Puppeteer's
    // margin option. Setting the margin in both places keeps them consistent.
    await page.addStyleTag({
      content: `
        @page { size: A4; }
        html {
          background: ${themeBg} !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          background: ${themeBg} !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      `,
    });

    // Do NOT use preferCSSPageSize — with that flag Chromium treats CSS @page as
    // authoritative for ALL properties including margin, which causes the top margin
    // to be dropped on pages after a page break (Chrome bug). With preferCSSPageSize
    // omitted, Puppeteer's margin option is authoritative and applies correctly to
    // every page.
    await page.pdf({
      path: pdfFile,
      format: 'A4',
      printBackground: true,
      margin: {
        top: pageMargin,
        right: pageMargin,
        bottom: pageMargin,
        left: pageMargin,
      },
    });

    const stats = await import('fs').then((fs) => fs.statSync(pdfFile));
    console.log(`PDF generated: ${pdfFile} (${(stats.size / 1024).toFixed(1)} KB)`);
  } finally {
    await browser.close();
  }
}

convert().catch((err) => {
  console.error('Puppeteer error:', err.message || err);
  process.exit(1);
});
