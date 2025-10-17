#!/usr/bin/env node

/**
 * Stirling PDF Sample Document Generator
 *
 * This script uses Puppeteer to generate a sample PDF from a HTML template.
 * The output is used in the onboarding tour and as a demo document
 * for users to experiment with Stirling PDF's features.
 */

import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_PATH = join(__dirname, 'template.html');
const OUTPUT_DIR = join(__dirname, '../../public/samples');
const OUTPUT_PATH = join(OUTPUT_DIR, 'Sample.pdf');

async function generatePDF() {
  console.log('🚀 Starting Stirling PDF sample document generation...\n');

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`✅ Created output directory: ${OUTPUT_DIR}`);
  }

  // Check if template exists
  if (!existsSync(TEMPLATE_PATH)) {
    console.error(`❌ Template file not found: ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  console.log(`📄 Reading template: ${TEMPLATE_PATH}`);

  let browser;
  try {
    // Launch Puppeteer
    console.log('🌐 Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set viewport to match A4 proportions
    await page.setViewport({
      width: 794,  // A4 width in pixels at 96 DPI
      height: 1123, // A4 height in pixels at 96 DPI
      deviceScaleFactor: 2 // Higher quality rendering
    });

    // Navigate to the template file
    const fileUrl = `file://${TEMPLATE_PATH}`;
    console.log('📖 Loading HTML template...');
    await page.goto(fileUrl, {
      waitUntil: 'networkidle0' // Wait for all resources to load
    });

    // Generate PDF with A4 dimensions
    console.log('📝 Generating PDF...');
    await page.pdf({
      path: OUTPUT_PATH,
      format: 'A4',
      printBackground: true,
      margin: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      },
      preferCSSPageSize: true
    });

    console.log('\n✅ PDF generated successfully!');
    console.log(`📦 Output: ${OUTPUT_PATH}`);

    // Get file size
    const stats = statSync(OUTPUT_PATH);
    const fileSizeInKB = (stats.size / 1024).toFixed(2);
    console.log(`📊 File size: ${fileSizeInKB} KB`);

  } catch (error) {
    console.error('\n❌ Error generating PDF:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed.');
    }
  }

  console.log('\n🎉 Done! Sample PDF is ready for use in Stirling PDF.\n');
}

// Run the generator
generatePDF().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
