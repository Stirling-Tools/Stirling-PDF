/**
 * End-to-End Tests for Compare Tool
 *
 * Regression coverage for the Compare slot auto-fill flow.
 *
 * Background: when a user has one file in the workbench and picks a second
 * file from the "My Files" picker (triggering handleRecentFileSelect), the
 * existing selection used to be replaced rather than unioned, so the Original
 * slot jumped to the new file and the Edited slot stayed empty. See fix in
 * FilesModalContext.handleRecentFileSelect that unions the newly picked IDs
 * with the current selection.
 *
 * The end-to-end invariant this test guards: after two distinct PDFs have been
 * added to the workbench through the file modal's add buttons, both Compare
 * slots are populated and the Compare action button is enabled.
 *
 * All backend API calls are mocked via page.route() — no real backend required.
 * The Vite dev server must be running (handled by playwright.config.ts webServer).
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const PDF_A = path.join(FIXTURES_DIR, "compare_sample_a.pdf");
const PDF_B = path.join(FIXTURES_DIR, "compare_sample_b.pdf");

async function mockAppApis(page: Page) {
  await page.route("**/api/v1/info/status", (route) =>
    route.fulfill({ json: { status: "UP" } }),
  );
  await page.route("**/api/v1/config/app-config", (route) =>
    route.fulfill({
      json: {
        enableLogin: false,
        languages: ["en-GB"],
        defaultLocale: "en-GB",
      },
    }),
  );
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: "testuser",
        email: "test@example.com",
        roles: ["ROLE_USER"],
      },
    }),
  );
  await page.route("**/api/v1/config/endpoints-availability", (route) =>
    route.fulfill({ json: { compare: { enabled: true } } }),
  );
  await page.route("**/api/v1/config/endpoint-enabled*", (route) =>
    route.fulfill({ json: true }),
  );
  await page.route("**/api/v1/config/group-enabled*", (route) =>
    route.fulfill({ json: true }),
  );
  await page.route("**/api/v1/ui-data/footer-info", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.route("**/api/v1/proprietary/**", (route) =>
    route.fulfill({ json: {} }),
  );
}

async function navigateToCompare(page: Page) {
  await page.locator('[data-tour="tool-button-compare"]').first().click();
  await page.waitForSelector('[data-testid="compare-slot-base"]', {
    timeout: 5000,
  });
}

async function uploadIntoSlot(
  page: Page,
  role: "base" | "comparison",
  filePath: string,
  expectedFilename: string,
) {
  // Set files directly on the hidden input (always in DOM, no popover needed)
  await page
    .getByTestId(`compare-slot-${role}-add-input`)
    .setInputFiles(filePath);

  const slot = page.locator(`[data-testid="compare-slot-${role}"]`);
  await expect(slot).toHaveAttribute("data-slot-state", "filled", {
    timeout: 10000,
  });
  await expect(slot).toHaveAttribute("data-slot-filename", expectedFilename);
}

test.describe("Compare tool slot selection", () => {
  test.beforeEach(async ({ page }) => {
    await mockAppApis(page);
    await page.goto("/?bypassOnboarding=true");
    await page.waitForSelector('[data-tour="tool-button-compare"]', {
      timeout: 10000,
    });
  });

  test("uploading a PDF via the Original add button fills the Original slot", async ({
    page,
  }) => {
    await navigateToCompare(page);

    const baseSlot = page.locator('[data-testid="compare-slot-base"]');
    const comparisonSlot = page.locator(
      '[data-testid="compare-slot-comparison"]',
    );

    await expect(baseSlot).toHaveAttribute("data-slot-state", "empty");
    await expect(comparisonSlot).toHaveAttribute("data-slot-state", "empty");

    await uploadIntoSlot(page, "base", PDF_A, "compare_sample_a.pdf");

    await expect(comparisonSlot).toHaveAttribute("data-slot-state", "empty");
  });

  test("uploading into both slots fills them and enables the Compare button", async ({
    page,
  }) => {
    await navigateToCompare(page);

    // Original slot first
    await uploadIntoSlot(page, "base", PDF_A, "compare_sample_a.pdf");

    // Edited slot second. This upload goes through handleFileUpload, which
    // adds via the internal selectFiles: true path (union with existing
    // selection). If the union breaks — as it did in FilesModalContext before
    // the fix to handleRecentFileSelect — the Original slot would be clobbered
    // and the Edited slot would remain empty.
    await uploadIntoSlot(page, "comparison", PDF_B, "compare_sample_b.pdf");

    // Both slots must remain populated with their respective files.
    const baseSlot = page.locator('[data-testid="compare-slot-base"]');
    const comparisonSlot = page.locator(
      '[data-testid="compare-slot-comparison"]',
    );
    await expect(baseSlot).toHaveAttribute("data-slot-state", "filled");
    await expect(baseSlot).toHaveAttribute(
      "data-slot-filename",
      "compare_sample_a.pdf",
    );
    await expect(comparisonSlot).toHaveAttribute("data-slot-state", "filled");
    await expect(comparisonSlot).toHaveAttribute(
      "data-slot-filename",
      "compare_sample_b.pdf",
    );

    // Compare button should be enabled now that both slots are set.
    const compareButton = page.getByRole("button", { name: "Compare" });
    await expect(compareButton).toBeEnabled();
  });

  test("picking a saved file from the FileSelectorPicker popover fills the comparison slot", async ({
    page,
  }) => {
    // Guards the FileSelectorPicker "Saved files" tab flow. Steps:
    //   1. Upload PDF_A into the base slot → stored in IndexedDB and slot fills.
    //   2. Clear the base slot (X button) so both slots are empty again.
    //   3. Upload PDF_B into the base slot.
    //   4. Open the comparison slot's FileSelectorPicker and pick PDF_A from
    //      the Saved files tab.
    // Result: base = PDF_B, comparison = PDF_A.

    await navigateToCompare(page);

    // Step 1 — upload PDF_A and confirm base slot fills (also persists to IndexedDB).
    await uploadIntoSlot(page, "base", PDF_A, "compare_sample_a.pdf");

    // Step 2 — clear the base slot via the X button so both slots reset.
    await page
      .locator('[data-testid="compare-slot-base"]')
      .getByRole("button", { name: "Remove file" })
      .click();
    await expect(
      page.locator('[data-testid="compare-slot-base"]'),
    ).toHaveAttribute("data-slot-state", "empty");

    // Step 3 — upload PDF_B into base. IndexedDB now has both A and B.
    await uploadIntoSlot(page, "base", PDF_B, "compare_sample_b.pdf");
    await expect(
      page.locator('[data-testid="compare-slot-comparison"]'),
    ).toHaveAttribute("data-slot-state", "empty");

    // Step 4 — open the comparison slot's FileSelectorPicker and pick PDF_A
    // from the Saved files tab.
    await page.locator('[data-testid="compare-slot-comparison-add"]').click();

    // Wait for the popover dropdown to open (withinPortal → attaches to body).
    await page.waitForSelector('[aria-pressed="true"]', {
      state: "visible",
      timeout: 5000,
    });

    // The list should contain PDF_A (PDF_B is excluded as it's in the base slot).
    const pdfARow = page.locator("text=compare_sample_a.pdf").first();
    await pdfARow.click();

    // Comparison slot must fill with PDF_A; base slot stays PDF_B.
    const baseSlot = page.locator('[data-testid="compare-slot-base"]');
    const comparisonSlot = page.locator(
      '[data-testid="compare-slot-comparison"]',
    );
    await expect(comparisonSlot).toHaveAttribute("data-slot-state", "filled", {
      timeout: 10000,
    });
    await expect(comparisonSlot).toHaveAttribute(
      "data-slot-filename",
      "compare_sample_a.pdf",
    );
    await expect(baseSlot).toHaveAttribute("data-slot-state", "filled");
    await expect(baseSlot).toHaveAttribute(
      "data-slot-filename",
      "compare_sample_b.pdf",
    );

    const compareButton = page.getByRole("button", { name: "Compare" });
    await expect(compareButton).toBeEnabled();
  });

  test("Clear selected empties both slots", async ({ page }) => {
    await navigateToCompare(page);
    await uploadIntoSlot(page, "base", PDF_A, "compare_sample_a.pdf");
    await uploadIntoSlot(page, "comparison", PDF_B, "compare_sample_b.pdf");

    // Sanity: both slots filled before the clear.
    await expect(
      page.locator('[data-testid="compare-slot-base"]'),
    ).toHaveAttribute("data-slot-state", "filled");
    await expect(
      page.locator('[data-testid="compare-slot-comparison"]'),
    ).toHaveAttribute("data-slot-state", "filled");

    // Open the Clear confirmation modal and confirm.
    await page.getByRole("button", { name: "Clear selected" }).click();
    // Wait for the confirmation modal to appear before clicking confirm.
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "visible",
      timeout: 5000,
    });
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Clear Selected" })
      .click();

    // Both slots must be empty after clearing.
    await page.waitForSelector(
      '[data-testid="compare-slot-base"][data-slot-state="empty"]',
      { timeout: 10000 },
    );
    await expect(
      page.locator('[data-testid="compare-slot-comparison"]'),
    ).toHaveAttribute("data-slot-state", "empty");
  });
});
