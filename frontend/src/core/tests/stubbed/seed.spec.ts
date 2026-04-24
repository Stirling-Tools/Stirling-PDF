import { test, expect } from "@app/tests/helpers/stub-test-base";
import * as path from "path";
import * as fs from "fs";

/**
 * Seed test for Stirling-PDF E2E tests.
 * This file is copied into generated tests by the Playwright Test Agents.
 * It provides the baseline environment: navigates to the app and verifies it loaded.
 */

// ─── Test Fixture Paths ─────────────────────────────────────────────────────

function resolveFixturePath(filename: string): string {
  const candidates = [
    path.join(
      process.cwd(),
      "frontend",
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
    path.join(process.cwd(), "src", "core", "tests", "test-fixtures", filename),
    path.join(__dirname, "..", "core", "tests", "test-fixtures", filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

export const TEST_FILES = {
  pdf: resolveFixturePath("sample.pdf"),
  docx: resolveFixturePath("sample.docx"),
  xlsx: resolveFixturePath("sample.xlsx"),
  pptx: resolveFixturePath("sample.pptx"),
  png: resolveFixturePath("sample.png"),
  jpg: resolveFixturePath("sample.jpg"),
  html: resolveFixturePath("sample.html"),
  txt: resolveFixturePath("sample.txt"),
  csv: resolveFixturePath("sample.csv"),
  xml: resolveFixturePath("sample.xml"),
  md: resolveFixturePath("sample.md"),
  svg: resolveFixturePath("sample.svg"),
  corrupted: resolveFixturePath("corrupted.pdf"),
} as const;

test.describe("Stirling-PDF seed", () => {
  test("seed - app loads", async ({ page }) => {
    // Navigate to the Stirling-PDF frontend
    await page.goto("/");

    // The app may redirect to /login if authentication is enabled.
    // Wait for the app to be ready: either the dashboard layout or the login page.
    await expect(
      page
        .locator(
          '.h-screen, .mobile-layout, [data-testid="dashboard"], img[alt*="Stirling"]',
        )
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Verify the title contains Stirling PDF
    await expect(page).toHaveTitle(/Stirling/i);
  });
});
