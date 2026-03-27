/**
 * End-to-End Tests for Convert Tool
 *
 * All backend API calls are mocked via page.route() — no real backend required.
 * The Vite dev server must be running (handled by playwright.config.ts webServer).
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, '../test-fixtures');
const SAMPLE_PDF = path.join(FIXTURES_DIR, 'sample.pdf');

// ---------------------------------------------------------------------------
// Endpoint availability map — all conversion endpoints enabled
// ---------------------------------------------------------------------------
const MOCK_ENDPOINTS_AVAILABILITY = Object.fromEntries(
  [
    'pdf-to-img', 'img-to-pdf', 'pdf-to-word', 'file-to-pdf', 'pdf-to-text',
    'pdf-to-html', 'pdf-to-xml', 'pdf-to-csv', 'pdf-to-xlsx', 'pdf-to-pdfa',
    'pdf-to-pdfx', 'pdf-to-presentation', 'pdf-to-markdown', 'pdf-to-cbz',
    'pdf-to-cbr', 'pdf-to-epub', 'html-to-pdf', 'svg-to-pdf', 'markdown-to-pdf',
    'eml-to-pdf', 'cbz-to-pdf', 'cbr-to-pdf', 'img-to-pdf',
  ].map((k) => [k, { enabled: true }])
);

// ---------------------------------------------------------------------------
// Helper: mock all standard app APIs needed to load the main UI
// ---------------------------------------------------------------------------
async function mockAppApis(page: Page) {
  // Backend probe — must return UP so Landing doesn't show "Backend not found"
  await page.route('**/api/v1/info/status', (route) =>
    route.fulfill({ json: { status: 'UP' } })
  );

  // App config — enableLogin:false puts the app in anonymous mode so no JWT/redirect needed
  await page.route('**/api/v1/config/app-config', (route) =>
    route.fulfill({
      json: { enableLogin: false, languages: ['en-GB'], defaultLocale: 'en-GB' },
    })
  );

  // Auth — fallback if anything calls auth/me
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      json: { id: 1, username: 'testuser', email: 'test@example.com', roles: ['ROLE_USER'] },
    })
  );

  // Endpoint availability — queried in batch by ConvertSettings
  await page.route('**/api/v1/config/endpoints-availability', (route) =>
    route.fulfill({ json: MOCK_ENDPOINTS_AVAILABILITY })
  );

  // Single-endpoint check — queried by Convert.tsx for the execute button
  await page.route('**/api/v1/config/endpoint-enabled*', (route) =>
    route.fulfill({ json: true })
  );

  // Group-enabled check — queried by some feature guards
  await page.route('**/api/v1/config/group-enabled*', (route) =>
    route.fulfill({ json: true })
  );

  // Footer info — non-critical, silence proxy errors
  await page.route('**/api/v1/ui-data/footer-info', (route) =>
    route.fulfill({ json: {} })
  );
}

// ---------------------------------------------------------------------------
// Helper: upload a file through the Files modal
// ---------------------------------------------------------------------------
async function uploadFile(page: Page, filePath: string) {
  await page.getByTestId('files-button').click();
  await page.waitForSelector('.mantine-Modal-overlay', { state: 'visible', timeout: 5000 });
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await page.waitForSelector('[data-testid="file-thumbnail"]', { timeout: 10000 });
}

// ---------------------------------------------------------------------------
// Helper: select FROM and TO formats in the Convert dropdowns
// ---------------------------------------------------------------------------
async function selectConvertFormats(page: Page, fromValue: string, toValue: string) {
  await page.getByTestId('convert-from-dropdown').click();
  await page.getByTestId(`format-option-${fromValue}`).click();
  await page.getByTestId('convert-to-dropdown').click();
  await page.getByTestId(`format-option-${toValue}`).click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe('Convert Tool', () => {
  test.beforeEach(async ({ page }) => {
    await mockAppApis(page);
    await page.goto('/?bypassOnboarding=true');
    await page.waitForSelector('[data-testid="files-button"]', { timeout: 10000 });
  });

  test('convert button is not visible before a format pair is selected', async ({ page }) => {
    await uploadFile(page, SAMPLE_PDF);

    await page.getByTestId('tool-convert').click();
    await page.waitForSelector('[data-testid="file-thumbnail"]');
    await page.getByTestId('file-thumbnail').first().click();

    // No formats chosen yet — the convert button should not exist
    await expect(page.getByTestId('convert-button')).toHaveCount(0);
  });

  test('successful PDF to PNG conversion shows download option', async ({ page }) => {
    // Minimal valid PNG header (8 bytes signature + IHDR chunk stub)
    const fakePng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      ...Array(504).fill(0),
    ]);

    await page.route('**/api/v1/convert/pdf/img', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'Content-Disposition': 'attachment; filename="sample.png"' },
        body: fakePng,
      })
    );

    await uploadFile(page, SAMPLE_PDF);
    await page.getByTestId('tool-convert').click();
    await page.waitForSelector('[data-testid="file-thumbnail"]');
    await page.getByTestId('file-thumbnail').first().click();

    await selectConvertFormats(page, 'pdf', 'png');
    await page.getByTestId('convert-button').click();

    await expect(page.getByTestId('download-result-button')).toBeVisible({ timeout: 10000 });
  });

  test('conversion API error shows error notification', async ({ page }) => {
    await page.route('**/api/v1/convert/pdf/img', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Internal server error: conversion failed',
      })
    );

    await uploadFile(page, SAMPLE_PDF);
    await page.getByTestId('tool-convert').click();
    await page.waitForSelector('[data-testid="file-thumbnail"]');
    await page.getByTestId('file-thumbnail').first().click();

    await selectConvertFormats(page, 'pdf', 'png');
    await page.getByTestId('convert-button').click();

    // Mantine Notification renders as role="alert"
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 5000 });
  });

  test('convert button appears only after a valid format pair is selected', async ({ page }) => {
    await uploadFile(page, SAMPLE_PDF);
    await page.getByTestId('tool-convert').click();
    await page.waitForSelector('[data-testid="file-thumbnail"]');
    await page.getByTestId('file-thumbnail').first().click();

    // Before formats selected — button absent
    await expect(page.getByTestId('convert-button')).toHaveCount(0);

    // Mock the single-endpoint check for pdf-to-img so the button is enabled
    await page.route('**/api/v1/config/endpoint-enabled*', (route) =>
      route.fulfill({ json: true })
    );

    await selectConvertFormats(page, 'pdf', 'png');

    // After selecting valid formats — button present and enabled
    await expect(page.getByTestId('convert-button')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('convert-button')).toBeEnabled();
  });
});
