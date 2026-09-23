import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

/**
 * Stubbed coverage for the Automate tool's import / export flows.
 *
 * Imports go through a single "Import" entry on the Create New kebab that
 * opens a modal. The modal accepts either a dropped JSON file or pasted
 * text, auto-detects the format (Automate vs Folder Scanning), and only
 * enables the Import button once the input parses cleanly.
 *
 * Exports come in two flavours:
 *   - Per-automation kebab: "Export" (native Automate) + "Export for
 *     Folder Scanning" (backend pipeline shape).
 *   - Builder buttons: same two options, side by side.
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
 * Hover the entry button matching `entryTitle` to reveal its kebab, then
 * click the kebab. Returns once the menu is open.
 */
async function openEntryMenu(
  page: Page,
  entryTitle: RegExp | string,
): Promise<void> {
  const entryButton = page
    .getByRole("button", { name: entryTitle as RegExp })
    .first();
  await entryButton.hover();
  const titleSource =
    typeof entryTitle === "string" ? entryTitle : entryTitle.source;
  const escaped = titleSource.replace(/^\^|\$$/g, "");
  const kebab = page
    .getByRole("button", {
      name: new RegExp(`Open menu for .*${escaped}`, "i"),
    })
    .first();
  await kebab.click();
}

function makeAutomateJson(name: string): string {
  return JSON.stringify({
    name,
    description: "Imported via Playwright",
    icon: "CompressIcon",
    operations: [
      { operation: "merge", parameters: { generateToc: true } },
      { operation: "compress", parameters: { compressionLevel: 3 } },
    ],
  });
}

function makeFolderScanJson(name: string): string {
  return JSON.stringify({
    name,
    pipeline: [
      {
        operation: "/api/v1/general/merge-pdfs",
        parameters: {
          generateToc: true,
          fileInput: "automated",
        },
      },
      {
        operation: "/api/v1/misc/compress-pdf",
        parameters: {
          compressionLevel: 3,
          fileInput: "automated",
        },
      },
    ],
    _examples: {
      outputDir: "{outputFolder}/{folderName}",
      outputFileName: "{filename}-{pipelineName}-{date}-{time}",
    },
    outputDir: "{outputFolder}",
    outputFileName: "{filename}",
  });
}

/**
 * Open the import modal from the "Create New Automation" kebab.
 */
async function openImportModal(page: Page): Promise<void> {
  await openEntryMenu(page, /Create New Automation/i);
  await page.getByRole("menuitem", { name: /^Import$/ }).click();
  await expect(
    page.getByRole("dialog", { name: /Import automation/i }),
  ).toBeVisible({ timeout: 5_000 });
}

test.describe("12. Automation Page — Import / Export", () => {
  test.beforeEach(async ({ page }) => {
    await gotoAutomate(page);
    await ensureOnSelection(page);
  });

  test.describe("12.1 Create New kebab — single Import option", () => {
    test("kebab on Create New entry exposes a single Import option", async ({
      page,
    }) => {
      await openEntryMenu(page, /Create New Automation/i);

      await expect(
        page.getByRole("menuitem", { name: /^Import$/ }),
      ).toBeVisible({ timeout: 5_000 });

      // Saved-only options should not appear on Create New.
      await expect(
        page.getByRole("menuitem", { name: /^Edit$/ }),
      ).not.toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: /^Delete$/ }),
      ).not.toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: /^Export$/ }),
      ).not.toBeVisible();
    });
  });

  test.describe("12.2 Import modal — paste flow", () => {
    test("pasting valid Automate JSON enables Import and saves the entry", async ({
      page,
    }) => {
      await openImportModal(page);

      // Import button starts disabled.
      const importBtn = page.getByRole("button", { name: /^Import$/ }).last();
      await expect(importBtn).toBeDisabled();

      const textarea = page.getByLabel(/Or paste JSON/i);
      await textarea.fill(makeAutomateJson("Pasted Automate"));

      // Detected-format badge should appear.
      await expect(page.getByText(/Automate JSON/).first()).toBeVisible({
        timeout: 5_000,
      });
      await expect(importBtn).toBeEnabled();

      await importBtn.click();

      // Modal closes and the new entry appears in Saved.
      await expect(
        page.getByRole("dialog", { name: /Import automation/i }),
      ).not.toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("button", { name: /Pasted Automate/i }).first(),
      ).toBeVisible({ timeout: 10_000 });

      // Icon must round-trip into IndexedDB. If it doesn't, the saved-entry
      // render falls back to SettingsIcon and looks like a silent picker bug.
      const persistedIcon = await page.evaluate(
        () =>
          new Promise<string | undefined>((resolve) => {
            const req = indexedDB.open("StirlingPDF_Automations", 1);
            req.onsuccess = () => {
              const db = req.result;
              const tx = db.transaction("automations", "readonly");
              const store = tx.objectStore("automations");
              const all = store.getAll();
              all.onsuccess = () => {
                const match = (
                  all.result as Array<{
                    name: string;
                    icon?: string;
                  }>
                ).find((a) => a.name === "Pasted Automate");
                resolve(match?.icon);
              };
              all.onerror = () => resolve(undefined);
            };
            req.onerror = () => resolve(undefined);
          }),
      );
      expect(persistedIcon).toBe("CompressIcon");
    });

    test("pasting valid Folder Scanning JSON shows the right format and imports", async ({
      page,
    }) => {
      await openImportModal(page);

      const textarea = page.getByLabel(/Or paste JSON/i);
      await textarea.fill(makeFolderScanJson("Pasted Folder Scan"));

      await expect(page.getByText(/Folder Scanning JSON/).first()).toBeVisible({
        timeout: 5_000,
      });
      await page
        .getByRole("button", { name: /^Import$/ })
        .last()
        .click();

      await expect(
        page.getByRole("button", { name: /Pasted Folder Scan/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("pasting invalid JSON shows an error and keeps Import disabled", async ({
      page,
    }) => {
      await openImportModal(page);

      const textarea = page.getByLabel(/Or paste JSON/i);
      await textarea.fill("{ this is not valid json");

      await expect(page.getByText(/Could not parse/i).first()).toBeVisible({
        timeout: 5_000,
      });
      const importBtn = page.getByRole("button", { name: /^Import$/ }).last();
      await expect(importBtn).toBeDisabled();
    });
  });

  test.describe("12.3 Import modal — file drop flow", () => {
    test("dropping an Automate JSON file fills the textarea and imports", async ({
      page,
    }) => {
      await openImportModal(page);

      // The Mantine Dropzone exposes a hidden file input we can target via
      // `setInputFiles`. There's only one file input inside the modal.
      const fileInput = page
        .getByRole("dialog", { name: /Import automation/i })
        .locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: "dropped.automate.json",
        mimeType: "application/json",
        buffer: Buffer.from(makeAutomateJson("Dropped Automate")),
      });

      // The textarea should reflect the dropped content.
      await expect(page.getByLabel(/Or paste JSON/i)).toHaveValue(
        /Dropped Automate/,
        { timeout: 5_000 },
      );
      await page
        .getByRole("button", { name: /^Import$/ })
        .last()
        .click();

      await expect(
        page.getByRole("button", { name: /Dropped Automate/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });

    test("dropping a Folder Scanning JSON file imports it", async ({
      page,
    }) => {
      await openImportModal(page);

      const fileInput = page
        .getByRole("dialog", { name: /Import automation/i })
        .locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: "dropped.folder-scan.json",
        mimeType: "application/json",
        buffer: Buffer.from(makeFolderScanJson("Dropped Folder Scan")),
      });

      await expect(page.getByText(/Folder Scanning JSON/).first()).toBeVisible({
        timeout: 5_000,
      });
      await page
        .getByRole("button", { name: /^Import$/ })
        .last()
        .click();

      await expect(
        page.getByRole("button", { name: /Dropped Folder Scan/i }).first(),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("12.4 Export — per-automation kebab menu", () => {
    test("saved entry kebab exposes Export and Export for Folder Scanning", async ({
      page,
    }) => {
      // Seed a saved automation by importing one first.
      await openImportModal(page);
      await page
        .getByLabel(/Or paste JSON/i)
        .fill(makeAutomateJson("Export Menu Seed"));
      await page
        .getByRole("button", { name: /^Import$/ })
        .last()
        .click();
      const seededEntry = page
        .getByRole("button", { name: /Export Menu Seed/i })
        .first();
      await expect(seededEntry).toBeVisible({ timeout: 10_000 });

      await openEntryMenu(page, /Export Menu Seed/i);

      await expect(
        page.getByRole("menuitem", { name: /^Export$/ }),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("menuitem", { name: /Export for Folder Scanning/i }),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByRole("menuitem", { name: /^Edit$/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("menuitem", { name: /^Delete$/ }),
      ).toBeVisible();
    });

    test("clicking 'Export' triggers a .automate.json download", async ({
      page,
    }) => {
      await openImportModal(page);
      await page
        .getByLabel(/Or paste JSON/i)
        .fill(makeAutomateJson("Download Test"));
      await page
        .getByRole("button", { name: /^Import$/ })
        .last()
        .click();
      await expect(
        page.getByRole("button", { name: /Download Test/i }).first(),
      ).toBeVisible({ timeout: 10_000 });

      await openEntryMenu(page, /Download Test/i);
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: /^Export$/ }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.automate\.json$/);
    });

    test("clicking 'Export for Folder Scanning' triggers a .folder-scan.json download", async ({
      page,
    }) => {
      await openImportModal(page);
      await page
        .getByLabel(/Or paste JSON/i)
        .fill(makeAutomateJson("Folder Download Test"));
      await page
        .getByRole("button", { name: /^Import$/ })
        .last()
        .click();
      await expect(
        page.getByRole("button", { name: /Folder Download Test/i }).first(),
      ).toBeVisible({ timeout: 10_000 });

      await openEntryMenu(page, /Folder Download Test/i);
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("menuitem", { name: /Export for Folder Scanning/i })
        .click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.folder-scan\.json$/);
    });
  });
});
