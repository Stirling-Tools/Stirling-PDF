/**
 * End-to-End Tests for Convert Tool
 *
 * All backend API calls are mocked via page.route() — no real backend required.
 * The Vite dev server must be running (handled by playwright.config.ts webServer).
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { mockAppApis } from "@app/tests/helpers/api-stubs";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

// ---------------------------------------------------------------------------
// Helper: dismiss the tour tooltip that can intercept clicks on firefox/webkit
// ---------------------------------------------------------------------------
async function dismissTourTooltip(page: Page) {
  const closeBtn = page.getByRole("button", { name: /close tooltip/i }).first();
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click();
  }
}

// ---------------------------------------------------------------------------
// Helper: upload a file through the Files modal
// Uses the HiddenFileInput (data-testid="file-input") which has the correct
// onChange handler. Waits for the modal to auto-close after upload.
// ---------------------------------------------------------------------------
async function uploadFile(page: Page, filePath: string) {
  await page.getByTestId("files-button").click();
  await page.waitForSelector(".mantine-Modal-overlay", {
    state: "visible",
    timeout: 5000,
  });
  await page.locator('[data-testid="file-input"]').setInputFiles(filePath);
  // Modal auto-closes after file is selected
  await page.waitForSelector(".mantine-Modal-overlay", {
    state: "hidden",
    timeout: 10000,
  });
}

// ---------------------------------------------------------------------------
// Helper: navigate to the Convert tool panel
// Tools use data-tour="tool-button-{key}" anchors in the ToolPanel.
// After clicking, the URL changes to /convert and the settings appear.
// ---------------------------------------------------------------------------
async function navigateToConvert(page: Page) {
  await page.locator('[data-tour="tool-button-convert"]').click();
  await page.waitForSelector('[data-testid="convert-from-dropdown"]', {
    timeout: 5000,
  });
}

// ---------------------------------------------------------------------------
// Helper: select the TO format in the convert dropdown
// The FROM format is auto-detected from the uploaded file (e.g. PDF → "Document (PDF)").
// Opening the TO dropdown renders format-option-{value} buttons in a portal.
// ---------------------------------------------------------------------------
async function selectToFormat(page: Page, toValue: string) {
  await page.getByTestId("convert-to-dropdown").click();
  await page.getByTestId(`format-option-${toValue}`).click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe("Convert Tool", () => {
  test.beforeEach(async ({ page }) => {
    await mockAppApis(page);
    await page.goto("/?bypassOnboarding=true");
    await page.waitForSelector('[data-testid="files-button"]', {
      timeout: 10000,
    });
  });

  test("convert button is disabled before a TO format is selected", async ({
    page,
  }) => {
    await uploadFile(page, SAMPLE_PDF);
    await navigateToConvert(page);

    // FROM is auto-detected as PDF; TO not selected → button visible but disabled
    const convertBtn = page.getByTestId("convert-button");
    await expect(convertBtn).toBeVisible({ timeout: 3000 });
    await expect(convertBtn).toBeDisabled();
  });

  test("successful PDF to PNG conversion shows download option", async ({
    page,
  }) => {
    // Minimal valid PNG header (8 bytes signature + padding)
    const fakePng = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...Array(504).fill(0),
    ]);

    await page.route("**/api/v1/convert/pdf/img", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "Content-Disposition": 'attachment; filename="sample.png"' },
        body: fakePng,
      }),
    );

    await uploadFile(page, SAMPLE_PDF);
    await navigateToConvert(page);
    await selectToFormat(page, "png");
    await dismissTourTooltip(page);
    await page.getByTestId("convert-button").click();

    await expect(page.getByTestId("download-result-button")).toBeVisible({
      timeout: 10000,
    });
  });

  test("conversion API error shows error notification", async ({ page }) => {
    await page.route("**/api/v1/convert/pdf/img", (route) =>
      route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: "Internal server error: conversion failed",
      }),
    );

    await uploadFile(page, SAMPLE_PDF);
    await navigateToConvert(page);
    await selectToFormat(page, "png");
    await dismissTourTooltip(page);
    await page.getByTestId("convert-button").click();

    // Mantine Notification renders as role="alert"
    await expect(page.getByRole("alert").first()).toBeVisible({
      timeout: 5000,
    });
  });

  test("convert button becomes enabled after selecting a valid TO format", async ({
    page,
  }) => {
    await uploadFile(page, SAMPLE_PDF);
    await navigateToConvert(page);

    // Before selecting TO format — button visible but disabled
    const convertBtn = page.getByTestId("convert-button");
    await expect(convertBtn).toBeVisible({ timeout: 3000 });
    await expect(convertBtn).toBeDisabled();

    // After selecting PNG as TO format — button enabled
    await selectToFormat(page, "png");
    await expect(convertBtn).toBeEnabled({ timeout: 3000 });
  });
});
