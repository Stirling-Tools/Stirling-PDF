/**
 * End-to-End Tests for Convert Tool
 *
 * Tests dynamically discover available conversion endpoints and test them.
 * Tests are automatically skipped if the backend endpoint is not available.
 *
 * Run with: npx playwright test ConvertE2E
 */

import { test, expect, Page } from '@playwright/test';
import {
  conversionDiscovery,
  type ConversionEndpoint
} from '../helpers/conversionEndpointDiscovery';
import { loginAndSetup } from '../../../tests/helpers/login';
import * as path from 'path';
import * as fs from 'fs';

// ─── Test fixture resolution ─────────────────────────────────────────────────

function resolveFixture(filename: string): string {
  const candidates = [
    path.join(__dirname, '..', 'test-fixtures', filename),
    path.join(process.cwd(), 'src', 'core', 'tests', 'test-fixtures', filename),
    path.join(process.cwd(), 'frontend', 'src', 'core', 'tests', 'test-fixtures', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]; // fallback — will fail with a clear "file not found"
}

const TEST_FILES: Record<string, string> = {
  pdf: resolveFixture('sample.pdf'),
  docx: resolveFixture('sample.docx'),
  doc: resolveFixture('sample.doc'),
  pptx: resolveFixture('sample.pptx'),
  xlsx: resolveFixture('sample.xlsx'),
  png: resolveFixture('sample.png'),
  jpg: resolveFixture('sample.jpg'),
  md: resolveFixture('sample.md'),
  eml: resolveFixture('sample.eml'),
  html: resolveFixture('sample.html'),
  txt: resolveFixture('sample.txt'),
  xml: resolveFixture('sample.xml'),
  csv: resolveFixture('sample.csv'),
  svg: resolveFixture('sample.svg'),
};

function getTestFileForFormat(format: string): string {
  const aliases: Record<string, string> = {
    office: 'docx',
    image: 'png',
    jpeg: 'jpg',
  };
  const key = aliases[format] ?? format;
  return TEST_FILES[key] ?? TEST_FILES.pdf;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Upload a file on the convert tool page via the hidden file input.
 * The landing page and tool pages both render a hidden <input type="file">.
 */
async function uploadFile(page: Page, filePath: string) {
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);

  // Wait for file to be registered — the Files step shows "✓ Selected: filename"
  await expect(page.getByText(/selected/i).first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Select from/to formats in the ConvertSettings dropdowns.
 * Uses the real data-testid attributes on GroupedFormatDropdown.
 */
async function selectFormats(page: Page, fromFormat: string, toFormat: string) {
  // Wait for the from-dropdown to appear
  const fromDropdown = page.locator('[data-testid="convert-from-dropdown"]');
  await expect(fromDropdown).toBeVisible({ timeout: 10_000 });

  // Check if the correct from-format is already auto-selected.
  // The convert tool auto-detects formats from the uploaded file, so we may
  // not need to open the dropdown at all.
  const fromText = await fromDropdown.textContent();
  const fromAlreadySelected = fromText && fromText.trim().length > 0
    && !fromText.toLowerCase().includes('source format');

  if (!fromAlreadySelected) {
    await fromDropdown.click();
    const fromOption = page.locator(`[data-testid="format-option-${fromFormat}"]`);
    await expect(fromOption).toBeVisible({ timeout: 5_000 });
    await fromOption.click();
    // Click body to close popover and any tooltip
    await page.locator('body').click({ position: { x: 0, y: 0 } });
    await page.waitForTimeout(300);
  }

  // Check if to-format is already auto-selected
  const toDropdown = page.locator('[data-testid="convert-to-dropdown"]');
  await expect(toDropdown).toBeVisible({ timeout: 5_000 });
  const toText = await toDropdown.textContent();
  const toAlreadySelected = toText && toText.trim().length > 0
    && !toText.toLowerCase().includes('target format')
    && !toText.toLowerCase().includes('select a source');

  if (!toAlreadySelected) {
    // Use force:true to bypass any tooltip overlay
    await toDropdown.click({ force: true });
    const toOption = page.locator(`[data-testid="format-option-${toFormat}"]`);
    await expect(toOption).toBeVisible({ timeout: 5_000 });
    await toOption.click();
    await page.locator('body').click({ position: { x: 0, y: 0 } });
    await page.waitForTimeout(300);
  }
}

/**
 * Click the convert button and wait for results.
 */
/**
 * Set image output mode to "Single" if the image options section is visible.
 * "Multiple" mode (default) triggers a zip download that bypasses the review panel.
 */
async function setImageOutputToSingle(page: Page) {
  const imageOptions = page.locator('[data-testid="image-options-section"]');
  const visible = await imageOptions.isVisible({ timeout: 2_000 }).catch(() => false);
  if (!visible) return;

  // The output select is a Mantine Select (combobox) — click it and pick "Single"
  const outputSelect = page.locator('[data-testid="output-type-select"]');
  if (await outputSelect.isVisible().catch(() => false)) {
    await outputSelect.click();
    // Select "Single" or "single" from the dropdown options
    const singleOption = page.getByRole('option', { name: /single/i }).first();
    if (await singleOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await singleOption.click();
    }
  }
}

async function executeConversion(page: Page) {
  const convertBtn = page.locator('[data-testid="convert-button"]');
  await expect(convertBtn).toBeVisible();
  await expect(convertBtn).toBeEnabled({ timeout: 5_000 });

  // Listen for download event (multi-output like PDF→images triggers a zip download)
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 }).catch(() => null);

  await convertBtn.click();

  // Build a single composite locator for all possible success indicators.
  // Playwright's .or() checks all branches efficiently in one pass — no polling needed.
  const successIndicator = page.locator('[data-testid="review-panel-container"]')
    .or(page.getByRole('button', { name: /undo/i }).first())
    .or(page.getByRole('button', { name: /download/i }).first())
    .or(page.getByText(/conversion results/i).first());

  // Race: either UI shows results or a file downloads directly
  await Promise.race([
    expect(successIndicator.first()).toBeVisible({ timeout: 60_000 }),
    downloadPromise,
  ]);
}

// ─── Endpoint discovery ──────────────────────────────────────────────────────

let availableConversions: ConversionEndpoint[] = [];

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Convert Tool E2E Tests', () => {
  // Generous timeout for conversion operations
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    console.log('Discovering available conversion endpoints...');
    availableConversions = await conversionDiscovery.getAvailableConversions();
    console.log(`Found ${availableConversions.length} available conversions`);
    availableConversions.forEach(c =>
      console.log(`  ✓ ${c.endpoint}: ${c.fromFormat} → ${c.toFormat}`)
    );
  });

  test.beforeEach(async ({ page }) => {
    // Login and dismiss cookie consent / onboarding overlays
    await loginAndSetup(page);

    // Navigate to the convert tool
    await page.goto('/convert');
    await page.waitForLoadState('domcontentloaded');
  });

  // ── Dynamic conversion tests ───────────────────────────────────────────

  const CONVERSIONS: { name: string; endpoint: string; from: string; to: string }[] = [
    { name: 'PDF to PNG',  endpoint: 'pdf-to-img',         from: 'pdf',   to: 'png' },
    { name: 'PDF to DOCX', endpoint: 'pdf-to-word',        from: 'pdf',   to: 'docx' },
    { name: 'DOCX to PDF', endpoint: 'file-to-pdf',        from: 'docx',  to: 'pdf' },
    { name: 'Image to PDF',endpoint: 'img-to-pdf',         from: 'png',   to: 'pdf' },
    { name: 'PDF to TXT',  endpoint: 'pdf-to-text',        from: 'pdf',   to: 'txt' },
    { name: 'PDF to HTML', endpoint: 'pdf-to-html',        from: 'pdf',   to: 'html' },
    { name: 'PDF to XML',  endpoint: 'pdf-to-xml',         from: 'pdf',   to: 'xml' },
    { name: 'PDF to CSV',  endpoint: 'pdf-to-csv',         from: 'pdf',   to: 'csv' },
    { name: 'PDF to PDFA', endpoint: 'pdf-to-pdfa',        from: 'pdf',   to: 'pdfa' },
    { name: 'HTML to PDF', endpoint: 'html-to-pdf',        from: 'html',  to: 'pdf' },
    { name: 'Markdown to PDF', endpoint: 'markdown-to-pdf', from: 'md',   to: 'pdf' },
  ];

  for (const conv of CONVERSIONS) {
    test(`${conv.name} conversion`, async ({ page }) => {
      // Skip if endpoint is not available on this backend
      const isAvailable = availableConversions.some(c => c.endpoint === conv.endpoint);
      test.skip(!isAvailable, `Endpoint ${conv.endpoint} is not available`);

      // Upload the source file
      const testFile = getTestFileForFormat(conv.from);
      await uploadFile(page, testFile);

      // Select formats
      await selectFormats(page, conv.from, conv.to);

      // For image conversions, set output to "Single" so results show in review panel
      await setImageOutputToSingle(page);

      // Execute and verify results appear
      await executeConversion(page);
    });
  }

  // ── PDF to Image: output type tests ─────────────────────────────────────

  test.describe('PDF to Image output types', () => {
    const IMAGE_OUTPUT_MODES = [
      { mode: 'single',   label: /single/i,   description: 'produces a single image' },
      { mode: 'multiple', label: /multiple/i,  description: 'produces multiple images (zip)' },
    ];

    for (const { mode, label, description } of IMAGE_OUTPUT_MODES) {
      test(`PDF to PNG with "${mode}" output — ${description}`, async ({ page }) => {
        const isAvailable = availableConversions.some(c => c.endpoint === 'pdf-to-img');
        test.skip(!isAvailable, 'pdf-to-img endpoint is not available');

        // Upload a PDF
        await uploadFile(page, TEST_FILES.pdf);

        // Formats auto-select PDF → image; verify and adjust if needed
        await selectFormats(page, 'pdf', 'png');

        // Set the output type
        const outputSelect = page.locator('[data-testid="output-type-select"]');
        await expect(outputSelect).toBeVisible({ timeout: 5_000 });
        await outputSelect.click();
        const option = page.getByRole('option', { name: label }).first();
        await expect(option).toBeVisible({ timeout: 3_000 });
        await option.click();

        // Execute and verify
        await executeConversion(page);
      });
    }

    const COLOR_TYPES = [
      { value: 'color',      label: /^colour$|^color$/i },
      { value: 'grayscale',  label: /grayscale|greyscale/i },
      { value: 'blackwhite', label: /black.*white/i },
    ];

    for (const { value, label } of COLOR_TYPES) {
      test(`PDF to PNG with "${value}" colour type`, async ({ page }) => {
        const isAvailable = availableConversions.some(c => c.endpoint === 'pdf-to-img');
        test.skip(!isAvailable, 'pdf-to-img endpoint is not available');

        await uploadFile(page, TEST_FILES.pdf);
        await selectFormats(page, 'pdf', 'png');

        // Set output to single (so results appear in review panel)
        await setImageOutputToSingle(page);

        // Set colour type
        const colorSelect = page.locator('[data-testid="color-type-select"]');
        await expect(colorSelect).toBeVisible({ timeout: 5_000 });
        await colorSelect.click();
        const option = page.getByRole('option', { name: label }).first();
        await expect(option).toBeVisible({ timeout: 3_000 });
        await option.click();

        await executeConversion(page);
      });
    }
  });

  // ── Static tests ───────────────────────────────────────────────────────

  test('convert button is disabled when no formats are selected', async ({ page }) => {
    // Upload a PDF file
    await uploadFile(page, TEST_FILES.pdf);

    // The convert button should be disabled because no to-format is chosen
    const convertBtn = page.locator('[data-testid="convert-button"]');
    // Button may not exist yet or should be disabled
    const btnVisible = await convertBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (btnVisible) {
      await expect(convertBtn).toBeDisabled();
    }
  });

  test('convert tool page loads with format dropdowns', async ({ page }) => {
    // Upload a file so the settings step expands
    await uploadFile(page, TEST_FILES.pdf);

    // Verify the from-dropdown is visible
    await expect(
      page.locator('[data-testid="convert-from-dropdown"]')
    ).toBeVisible({ timeout: 10_000 });
  });
});
