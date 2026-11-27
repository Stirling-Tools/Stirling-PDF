import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

/**
 * Stubbed coverage for the `/automate` super-tool. The Automate UI is one
 * surface with three modes: library ↔ builder ↔ workspace (run). These specs exercise
 * the surface area that doesn't require a live backend run — the catalogue,
 * the builder save flow, and the per-automation menu.
 *
 * Live runs (actually executing a pipeline against a real backend) live in
 * `src/editor/core/tests/live/automate-chain.spec.ts`.
 */

/**
 * IndexedDB persists across tests sharing a worker. Each test wipes the
 * automation store before navigating so the library starts with nothing saved.
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
 * Land on the library. The auto-goto fixture sometimes parks us on the
 * builder if a previous test left state behind; the back arrow snaps back to a
 * known state.
 */
async function ensureOnSelection(page: Page): Promise<void> {
  const newButton = page.getByRole("button", { name: /^New$/ });
  const back = page.getByRole("button", { name: /Back to automations/i });
  await expect(newButton.or(back).first()).toBeVisible({ timeout: 20_000 });
  if (!(await newButton.isVisible())) {
    await back.click();
    await expect(newButton).toBeVisible({ timeout: 5_000 });
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
    test("should display suggested workflows, and no Saved section while nothing is saved", async ({
      page,
    }) => {
      await expect(page).toHaveURL(/\/automate/);
      await ensureOnSelection(page);

      await expect(
        page.getByRole("heading", { name: "Automations" }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: /^Saved/ })).toHaveCount(
        0,
      );
      await expect(page.getByRole("button", { name: /^New$/ })).toBeVisible();
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

      await page.getByRole("button", { name: /^New$/ }).click();

      await expect(page.getByText(/New automation/i).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByLabel(/^Name/)).toBeVisible({
        timeout: 5_000,
      });
      await expect(
        page.getByRole("button", { name: /Add step/i }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /^Save$/ }).first(),
      ).toBeVisible();
    });

    test("save button stays disabled until a name is filled", async ({
      page,
    }) => {
      await ensureOnSelection(page);
      await page.getByRole("button", { name: /^New$/ }).click();

      const saveBtn = page.getByRole("button", { name: /^Save$/ }).first();
      await expect(saveBtn).toBeVisible({ timeout: 5_000 });
      await expect(saveBtn).toBeDisabled();

      // Naming alone shouldn't enable save — a tool must be added too.
      await page.getByLabel(/^Name/).fill("E2E Builder Smoke");
      await expect(saveBtn).toBeDisabled();
    });

    test("both export formats are offered in the builder once it is valid", async ({
      page,
    }) => {
      await ensureOnSelection(page);
      await page.getByRole("button", { name: /^New$/ }).click();

      const exportMenu = page.getByRole("button", { name: /^Export$/ });
      await expect(exportMenu).toBeVisible({ timeout: 5_000 });
      // Same disabled-when-invalid contract as Save — no name + no tool.
      await expect(exportMenu).toBeDisabled();

      await page.getByLabel(/^Name/).fill("E2E Export");
      await page
        .getByPlaceholder(/Search tools/i)
        .first()
        .click();
      await page.keyboard.type("Compress");
      await page
        .getByRole("button", { name: /Compress/ })
        .first()
        .click();
      await expect(exportMenu).toBeEnabled();

      await exportMenu.click();
      await expect(
        page.getByRole("menuitem", { name: /Automate JSON/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: /Folder Scanning JSON/i }),
      ).toBeVisible();
    });
  });

  test.describe("11.3 Automation - Suggested copy-to-saved", () => {
    test("copies a suggested automation into the Saved list", async ({
      page,
    }) => {
      await ensureOnSelection(page);

      await openEntryMenu(page, /Secure PDF Ingestion/i);
      await page.getByRole("menuitem", { name: /^Duplicate$/i }).click();

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
