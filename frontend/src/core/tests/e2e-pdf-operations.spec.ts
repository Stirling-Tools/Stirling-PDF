import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";
import * as path from "path";
import * as fs from "fs";

/**
 * E2E tests for real PDF operations.
 * These tests upload actual PDF files, process them through the backend,
 * and verify the results are produced.
 */

// Resolve test fixture paths - works from both frontend/ and repo root
function fixture(filename: string): string {
  const candidates = [
    path.resolve(
      process.cwd(),
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
    path.resolve(
      process.cwd(),
      "frontend",
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Test fixture not found: ${filename} (tried: ${candidates.join(", ")})`,
  );
}

// Additional test PDFs from the testing/ directory
function testingFile(filename: string): string {
  const candidates = [
    path.resolve(process.cwd(), "..", "testing", filename),
    path.resolve(process.cwd(), "testing", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Testing file not found: ${filename} (tried: ${candidates.join(", ")})`,
  );
}

// Helper: upload file(s) via the hidden file input on a tool page
async function uploadFiles(
  page: import("@playwright/test").Page,
  filePaths: string[],
) {
  const fileInput = page
    .locator('[data-testid="file-input"], input[type="file"]')
    .first();
  await fileInput.setInputFiles(filePaths);

  // Wait for files to be registered - look for the "Selected" confirmation text
  // The UI shows "✓ Selected: filename.pdf" when files are loaded
  await expect(page.getByText(/selected/i).first()).toBeVisible({
    timeout: 15000,
  });
}

// Helper: click the execute/run button and wait for results.
// Some tools (e.g. Merge) land in viewer mode after upload and require
// switching to file editor before the run button becomes enabled. If the
// viewer-mode hint button is visible, click it first.
async function executeAndWaitForResults(
  page: import("@playwright/test").Page,
  timeout = 60000,
) {
  const goToFileEditor = page.getByRole("button", {
    name: /go to file editor/i,
  });
  if (await goToFileEditor.isVisible({ timeout: 2000 }).catch(() => false)) {
    await goToFileEditor.click();
  }

  const runButton = page.locator('[data-tour="run-button"]');
  await expect(runButton).toBeEnabled({ timeout: 10000 });
  await runButton.click();

  // Wait for the review/results panel to appear
  await expect(
    page.locator('[data-testid="review-panel-container"]'),
  ).toBeVisible({ timeout });
}

test.describe("E2E PDF Operations", () => {
  test.describe.configure({ timeout: 120000 });

  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test.describe("Merge Tool - End to End", () => {
    test("should merge two PDF files and produce a result", async ({
      page,
    }) => {
      await page.goto("/merge");
      await page.waitForLoadState("domcontentloaded");

      // Upload two PDF files (merge requires minimum 2)
      const file1 = testingFile("test_pdf_1.pdf");
      const file2 = testingFile("test_pdf_2.pdf");
      await uploadFiles(page, [file1, file2]);

      // Click merge button and wait for results
      await executeAndWaitForResults(page);

      // Verify results panel shows with processed file
      const reviewPanel = page.locator(
        '[data-testid="review-panel-container"]',
      );
      await expect(reviewPanel).toBeVisible();
    });

    test("should merge three PDF files", async ({ page }) => {
      await page.goto("/merge");
      await page.waitForLoadState("domcontentloaded");

      const file1 = testingFile("test_pdf_1.pdf");
      const file2 = testingFile("test_pdf_2.pdf");
      const file3 = testingFile("test_pdf_3.pdf");
      await uploadFiles(page, [file1, file2, file3]);

      await executeAndWaitForResults(page);
      await expect(
        page.locator('[data-testid="review-panel-container"]'),
      ).toBeVisible();
    });
  });

  test.describe("Split Tool - End to End", () => {
    test("should split a PDF by page numbers", async ({ page }) => {
      await page.goto("/split");
      await page.waitForLoadState("domcontentloaded");

      // Upload a PDF file
      await uploadFiles(page, [fixture("sample.pdf")]);

      // Select "Page Numbers" split method from the CardSelector
      await page
        .getByText(/Page Numbers/i)
        .first()
        .click();

      // Wait for the settings step to expand and find the page numbers input
      const pagesInput = page.getByPlaceholder(/Custom Page Selection/i);
      await pagesInput.waitFor({ state: "visible", timeout: 10000 });
      await pagesInput.fill("1");

      // Execute split
      await executeAndWaitForResults(page);

      // Verify results
      await expect(
        page.locator('[data-testid="review-panel-container"]'),
      ).toBeVisible();
    });
  });

  test.describe("Compress Tool - End to End", () => {
    test("should compress a PDF file", async ({ page }) => {
      await page.goto("/compress");
      await page.waitForLoadState("domcontentloaded");

      // Upload a PDF file
      await uploadFiles(page, [fixture("sample.pdf")]);

      // Default settings (quality level 5) should be fine
      await executeAndWaitForResults(page);

      // Verify results
      await expect(
        page.locator('[data-testid="review-panel-container"]'),
      ).toBeVisible();
    });
  });

  test.describe("Add Password Tool - End to End", () => {
    test("should add a password to a PDF file", async ({ page }) => {
      await page.goto("/add-password");
      await page.waitForLoadState("domcontentloaded");

      // Upload a PDF file
      await uploadFiles(page, [fixture("sample.pdf")]);

      // Fill in the password field - wait for the password step to be visible
      const passwordInput = page.getByPlaceholder(/password/i).first();
      await passwordInput.waitFor({ state: "visible", timeout: 10000 });
      await passwordInput.fill("testpassword123");

      // Execute add password
      await executeAndWaitForResults(page);

      // Verify results
      await expect(
        page.locator('[data-testid="review-panel-container"]'),
      ).toBeVisible();
    });
  });

  test.describe("Convert Tool - End to End", () => {
    test("should convert an image to PDF", async ({ page }) => {
      await page.goto("/convert");
      await page.waitForLoadState("domcontentloaded");

      // Upload an image file (PNG -> PDF conversion)
      await uploadFiles(page, [fixture("sample.png")]);

      // The convert tool auto-detects input format
      // Execute conversion
      await executeAndWaitForResults(page);

      // Verify results
      await expect(
        page.locator('[data-testid="review-panel-container"]'),
      ).toBeVisible();
    });
  });
});
