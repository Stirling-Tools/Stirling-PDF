import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { openRecents, uploadFiles } from "@app/tests/helpers/ui-helpers";

test.use({ filesViewMode: "grid" });

const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

const rows = (page: Page) => page.locator(".file-sidebar-file-item");

/** Hover the first sidebar row (the kebab only shows on hover) and open it. */
async function openKebab(page: Page): Promise<void> {
  const row = rows(page).first();
  await row.hover();
  await row.locator(".file-sidebar-kebab-btn").click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test("the kebab lists the file's actions under its full name", async ({
  page,
}) => {
  await uploadFiles(page, SAMPLE);
  await openKebab(page);

  const menu = page.getByRole("menu");
  await expect(menu.locator(".file-sidebar-kebab-header-name")).toHaveText(
    "sample.pdf",
  );
  // Type · size · date - the row itself has no space for the size.
  await expect(menu.locator(".file-sidebar-kebab-header-meta")).toContainText(
    "PDF",
  );
  // A lone upload lands in the viewer, so the toggle offers the way out.
  await expect(
    menu.getByRole("menuitem", { name: "Close viewer" }),
  ).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Download" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test("Download saves the file under its current name", async ({ page }) => {
  await uploadFiles(page, SAMPLE);
  await openKebab(page);

  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("sample.pdf");
});

test("Rename updates the row and survives a reload", async ({ page }) => {
  await uploadFiles(page, SAMPLE);
  await openKebab(page);
  await page.getByRole("menuitem", { name: "Rename" }).click();

  // Only the base name is editable; the extension is re-applied on submit.
  const input = page.getByLabel("File name");
  await expect(input).toHaveValue("sample");
  await input.fill("quarterly report");
  await page.getByRole("button", { name: "Rename" }).click();

  await expect(rows(page).first()).toContainText("quarterly report.pdf");

  // The name is metadata in IndexedDB, so it must outlive the page.
  await page.reload();
  await expect(rows(page).first()).toContainText("quarterly report.pdf");
});

test("Duplicate adds a copy to the library", async ({ page }) => {
  await uploadFiles(page, SAMPLE);
  await openKebab(page);
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).filter({ hasText: "sample (copy).pdf" })).toHaveCount(
    1,
  );
});

test("a duplicate inherits the original's classification", async ({ page }) => {
  // The copy is byte-identical, so it must land in the same category group -
  // it inherits the label rather than waiting on the idle backfill to re-parse.
  await uploadFiles(
    page,
    path.join(
      import.meta.dirname,
      "../test-fixtures/classification/classified_invoice.pdf",
    ),
  );
  const financial = page
    .locator(".file-sidebar-group")
    .filter({ hasText: "Financial" });
  await expect(financial).toBeVisible({ timeout: 15_000 });

  await openKebab(page);
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  const copy = rows(page)
    .filter({ hasText: "classified_invoice (copy).pdf" })
    .first();
  await expect(copy).toContainText("Invoice", { timeout: 5_000 });
  await expect(financial.locator(".file-sidebar-group-count")).toHaveText("2");
});

const cards = (page: Page) => page.locator(".files-page-card:not(.is-folder)");

async function openCardKebab(page: Page): Promise<void> {
  await uploadFiles(page, SAMPLE);
  await openRecents(page);
  const card = cards(page).filter({ hasText: "sample.pdf" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /File actions/i }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test("Recents offers the same file actions as the sidebar", async ({
  page,
}) => {
  await openCardKebab(page);

  const menu = page.getByRole("menu");
  await expect(
    menu.getByRole("menuitem", { name: "Add to workspace" }),
  ).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Move to…" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Download" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test("Recents Download saves the file under its current name", async ({
  page,
}) => {
  await openCardKebab(page);

  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("sample.pdf");
});

test("Recents Rename updates the card", async ({ page }) => {
  await openCardKebab(page);
  await page.getByRole("menuitem", { name: "Rename" }).click();

  await page.getByLabel("File name").fill("statement");
  await page.getByRole("button", { name: "Rename" }).click();

  await expect(cards(page).filter({ hasText: "statement.pdf" })).toHaveCount(1);
});

test("Recents Duplicate adds a copy", async ({ page }) => {
  await openCardKebab(page);
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(
    cards(page).filter({ hasText: "sample (copy).pdf" }),
  ).toHaveCount(1);
});
