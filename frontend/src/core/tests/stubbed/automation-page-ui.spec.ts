import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

/**
 * Stubbed coverage for the `/automate` super-tool. The Automate UI is a small
 * three-step state machine: Selection ↔ Creation ↔ Run. These specs exercise
 * the surface area that doesn't require a live backend run — the catalogue,
 * the builder save flow, and the per-automation menu.
 *
 * Live runs (actually executing a pipeline against a real backend) live in
 * `src/core/tests/live/automate-chain.spec.ts`.
 */

/**
 * IndexedDB persists across tests sharing a worker. Each test wipes the
 * automation store before navigating so the "Saved" list starts empty.
 */
async function clearAutomationStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      indexedDB.deleteDatabase("StirlingPDF_Automations");
    } catch {
      // First-page-load case where IDB hasn't been opened yet — safe to ignore.
    }
  });
}

async function gotoAutomate(page: Page): Promise<void> {
  await clearAutomationStorage(page);
  await page.goto("/automate");
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Land on the Selection step. The auto-goto fixture sometimes parks us on the
 * builder if a previous test left state behind; click the section header to
 * snap back to a known state.
 */
async function ensureOnSelection(page: Page): Promise<void> {
  const savedHeader = page.getByText("Saved").first();
  if (!(await savedHeader.isVisible({ timeout: 2_000 }).catch(() => false))) {
    await page
      .getByText(/Automation Selection/i)
      .first()
      .click();
    await expect(savedHeader).toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Hover the entry whose title matches `entryTitle` and click its kebab.
 * Returns once the kebab menu is open and the dropdown is visible.
 */
async function openEntryMenu(page: Page, entryTitle: RegExp): Promise<void> {
  const entry = page.getByRole("button", { name: entryTitle }).first();
  await entry.hover();
  const kebab = page
    .getByRole("button", { name: /^Open menu for / })
    .filter({ hasText: "" }) // ActionIcon has no text content
    .first();
  // Match by accessible-name fragment — the title is interpolated.
  const titleHint = (entryTitle.source || "")
    .replace(/^\^|\$$/g, "")
    .replace(/\\/g, "");
  const scopedKebab = page
    .getByRole("button", {
      name: new RegExp(`Open menu for .*${titleHint}`, "i"),
    })
    .first();
  if (await scopedKebab.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await scopedKebab.click();
  } else {
    await kebab.click();
  }
}

test.describe("11. Automation Page", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAutomate(page);
  });

  test.describe("11.1 Automation - Suggested Workflows", () => {
    test("should display saved and suggested workflows", async ({ page }) => {
      const automateLink = page.locator('a[href="/automate"]').first();
      await expect(automateLink).toBeVisible();

      await expect(
        page.getByText(/Automation Selection/i).first(),
      ).toBeVisible();
      await ensureOnSelection(page);

      await expect(page.getByText("Saved").first()).toBeVisible();
      await expect(
        page.getByText(/Create New Automation/i).first(),
      ).toBeVisible();
      await expect(page.getByText("Suggested").first()).toBeVisible();

      const suggestedWorkflows = [
        /Secure PDF Ingestion/i,
        /Pre-publish Sanitization/i,
        /Email Preparation/i,
        /Security Workflow/i,
        /Process Images/i,
      ];

      for (const workflow of suggestedWorkflows) {
        await expect(page.getByText(workflow).first()).toBeVisible({
          timeout: 5_000,
        });
      }
    });
  });

  test.describe("11.2 Automation - Create New Automation", () => {
    test("should open automation builder when clicking create button", async ({
      page,
    }) => {
      await ensureOnSelection(page);

      await page
        .getByText(/Create New Automation/i)
        .first()
        .click();

      await expect(page.getByText(/Create Automation/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/Automation Name/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/Add Tool/i).first()).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Save Automation/i }).first(),
      ).toBeVisible();
    });

    test("save button stays disabled until a name is filled", async ({
      page,
    }) => {
      await ensureOnSelection(page);
      await page
        .getByText(/Create New Automation/i)
        .first()
        .click();

      const saveBtn = page
        .getByRole("button", { name: /Save Automation/i })
        .first();
      await expect(saveBtn).toBeVisible({ timeout: 5_000 });
      await expect(saveBtn).toBeDisabled();

      // Naming alone shouldn't enable save — a tool must be added too.
      await page.getByLabel(/Automation Name/i).fill("E2E Builder Smoke");
      await expect(saveBtn).toBeDisabled();
    });

    test("both export buttons render in the builder and are disabled until valid", async ({
      page,
    }) => {
      await ensureOnSelection(page);
      await page
        .getByText(/Create New Automation/i)
        .first()
        .click();

      const exportAutomate = page
        .getByRole("button", { name: /^Export$/ })
        .first();
      const exportFolderScan = page
        .getByRole("button", { name: /Export for Folder Scanning/i })
        .first();

      await expect(exportAutomate).toBeVisible({ timeout: 5_000 });
      await expect(exportFolderScan).toBeVisible({ timeout: 5_000 });
      // Same disabled-when-invalid contract as Save — no name + no tool.
      await expect(exportAutomate).toBeDisabled();
      await expect(exportFolderScan).toBeDisabled();
    });
  });

  test.describe("11.3 Automation - Suggested copy-to-saved", () => {
    test("copies a suggested automation into the Saved list", async ({
      page,
    }) => {
      await ensureOnSelection(page);

      await openEntryMenu(page, /Secure PDF Ingestion/i);
      await page.getByRole("menuitem", { name: /Copy to Saved/i }).click();

      // The suggested entry stays in the list and a duplicate appears under
      // Saved, so the count of matching texts goes from 1 to 2.
      await expect
        .poll(async () => page.getByText(/Secure PDF Ingestion/i).count(), {
          timeout: 5_000,
        })
        .toBeGreaterThanOrEqual(2);
    });
  });
});
