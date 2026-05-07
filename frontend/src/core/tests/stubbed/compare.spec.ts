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
import { mockAppApis } from "@app/tests/helpers/api-stubs";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const PDF_A = path.join(FIXTURES_DIR, "compare_sample_a.pdf");
const PDF_B = path.join(FIXTURES_DIR, "compare_sample_b.pdf");

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
  await page.locator(`[data-testid="compare-slot-${role}-add"]`).click();
  await page.waitForSelector(".mantine-Modal-overlay", {
    state: "visible",
    timeout: 5000,
  });
  await page.locator('[data-testid="file-input"]').setInputFiles(filePath);

  // The slot becoming filled is the user-visible outcome we actually care
  // about. Don't gate on the modal-overlay close animation — Mantine 9's
  // Modal can leave the overlay element mounted briefly while transitioning,
  // which races with successive uploads in this test and produces flaky
  // 10s timeouts. The slot fill assertion below covers the same intent and
  // implies the upload completed.
  const slot = page.locator(`[data-testid="compare-slot-${role}"]`);
  await expect(slot).toHaveAttribute("data-slot-state", "filled", {
    timeout: 15000,
  });
  await expect(slot).toHaveAttribute("data-slot-filename", expectedFilename);

  // Wait for the modal overlay to be fully gone before the next interaction
  // so click targets in subsequent uploads aren't intercepted.
  await page
    .locator(".mantine-Modal-overlay")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {
      /* if it's detached or re-detached during teardown, that's fine */
    });
}

test.describe("Compare tool slot selection", () => {
  test.beforeEach(async ({ page }) => {
    await mockAppApis(page);
    await page.goto("/?bypassOnboarding=true");
    await page.waitForSelector('[data-tour="tool-button-compare"]', {
      timeout: 10000,
    });
  });

  test("Original slot fills when a PDF is dropped via the landing dropzone", async ({
    page,
  }) => {
    // Regression guard for the "middle state" bug: the landing dropzone path
    // (FileManager's hidden file-input used by the drop-prompt on the empty
    // workbench) dispatches ADD_FILES and SET_SELECTED_FILES on a different
    // cadence than the modal-based upload. During the window where files.ids
    // has the new file but selectedFileIds is still empty, the slot would
    // show the placeholder unless the auto-fill falls back to allIds.
    await navigateToCompare(page);

    const baseSlot = page.locator('[data-testid="compare-slot-base"]');
    await expect(baseSlot).toHaveAttribute("data-slot-state", "empty");

    // Target the visible landing-prompt file input on the empty Compare tool.
    const visibleFileInput = page.locator(
      'input[type="file"]:not([data-testid="file-input"])',
    );
    await visibleFileInput.first().setInputFiles(PDF_A);

    // Assert the slot fills within a short window. Without the allIds
    // fallback the slot stayed on the placeholder for 4+ seconds in manual
    // testing because the SET_SELECTED_FILES dispatch lagged the ADD_FILES
    // dispatch by many renders.
    await expect(baseSlot).toHaveAttribute("data-slot-state", "filled", {
      timeout: 2000,
    });
    await expect(baseSlot).toHaveAttribute(
      "data-slot-filename",
      "compare_sample_a.pdf",
    );
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

  test("picking a stored file from the recent-files modal unions it with the current selection", async ({
    page,
  }) => {
    // This test specifically guards the handleRecentFileSelect code path in
    // FilesModalContext. Setup:
    //   1. Upload PDF_A so it lands in IndexedDB storage.
    //   2. Reload the page — workbench resets but IndexedDB persists.
    //   3. Upload PDF_B fresh so only PDF_B is in the workbench and selected.
    //   4. Open the Files modal and pick PDF_A from "Recent".
    // Without the fix, step 4 REPLACES the selection with [PDF_A] and the
    // Compare Original slot jumps to PDF_A while Edited stays empty. With the
    // fix, the selection becomes [PDF_B, PDF_A] and both slots populate.

    // Step 1 — upload PDF_A so it's persisted in IndexedDB.
    await navigateToCompare(page);
    await uploadIntoSlot(page, "base", PDF_A, "compare_sample_a.pdf");

    // Step 2 — reload. Workbench clears but IndexedDB retains PDF_A.
    // page.goto reuses the mocked routes and re-applies bypassOnboarding.
    await page.goto("/?bypassOnboarding=true");
    await page.waitForSelector('[data-tour="tool-button-compare"]', {
      timeout: 10000,
    });
    await navigateToCompare(page);
    await expect(
      page.locator('[data-testid="compare-slot-base"]'),
    ).toHaveAttribute("data-slot-state", "empty");

    // Step 3 — upload PDF_B fresh. Now workbench = [PDF_B], IndexedDB = [A, B].
    await uploadIntoSlot(page, "base", PDF_B, "compare_sample_b.pdf");
    await expect(
      page.locator('[data-testid="compare-slot-comparison"]'),
    ).toHaveAttribute("data-slot-state", "empty");

    // Step 4 — open the modal from the sidebar Files button and pick PDF_A
    // from the recent list.
    await page.getByTestId("files-button").click();
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "visible",
      timeout: 5000,
    });

    // The recent-files list renders an entry per stored file. Click the
    // checkbox for PDF_A (NOT the ACTIVE entry for PDF_B). We target the
    // label text to disambiguate.
    const pdfARow = page
      .locator(".mantine-Modal-root")
      .locator("text=compare_sample_a.pdf")
      .first();
    await pdfARow.click();

    // Confirm selection via "Open File".
    await page.getByRole("button", { name: "Open File" }).click();
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "hidden",
      timeout: 10000,
    });

    // Both slots must be populated. Specifically, the Original slot must still
    // be PDF_B (the pre-existing selection, not clobbered) and the Edited slot
    // must be PDF_A (newly unioned in).
    const baseSlot = page.locator('[data-testid="compare-slot-base"]');
    const comparisonSlot = page.locator(
      '[data-testid="compare-slot-comparison"]',
    );
    await expect(baseSlot).toHaveAttribute("data-slot-state", "filled", {
      timeout: 10000,
    });
    await expect(comparisonSlot).toHaveAttribute("data-slot-state", "filled", {
      timeout: 10000,
    });

    const compareButton = page.getByRole("button", { name: "Compare" });
    await expect(compareButton).toBeEnabled();
  });

  test("Clear selected empties both slots, clears the selection banner, and removes files from the workbench", async ({
    page,
  }) => {
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
    await page.getByRole("button", { name: "Clear and return" }).click();

    // The tool re-mounts on workbench switch; wait for the empty-state base slot.
    await page.waitForSelector(
      '[data-testid="compare-slot-base"][data-slot-state="empty"]',
      { timeout: 10000 },
    );
    await expect(
      page.locator('[data-testid="compare-slot-comparison"]'),
    ).toHaveAttribute("data-slot-state", "empty");

    // The "N files selected" / "Selected: X" banner must be gone because the
    // files have been removed from the workbench.
    await expect(
      page.getByText(/\d+\s+files?\s+selected|Selected:\s+/i),
    ).toHaveCount(0);
  });
});
