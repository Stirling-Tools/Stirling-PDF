import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

// Per-file actions live behind a kebab on two surfaces - the file sidebar and
// the My Files grid. They must offer the same file actions on both.

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

  // The copy carries the label straight away - its row shows the label chip...
  const copy = rows(page)
    .filter({ hasText: "classified_invoice (copy).pdf" })
    .first();
  await expect(copy).toContainText("Invoice", { timeout: 5_000 });
  // ...and it counts towards the same category group.
  await expect(financial.locator(".file-sidebar-group-count")).toHaveText("2");
});

// ─── My Files grid: the same actions, same behaviour ────────────────────────

const cards = (page: Page) => page.locator(".files-page-card:not(.is-folder)");

/** Upload a file, cross to My Files, and open the card's kebab. */
async function openCardKebab(page: Page): Promise<void> {
  await uploadFiles(page, SAMPLE);
  await page.getByTestId("my-files-button").click();
  const card = cards(page).filter({ hasText: "sample.pdf" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: /File actions/i }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test("My Files offers the same file actions as the sidebar", async ({
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

test("My Files Download saves the file under its current name", async ({
  page,
}) => {
  await openCardKebab(page);

  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("sample.pdf");
});

test("My Files Rename updates the card", async ({ page }) => {
  await openCardKebab(page);
  await page.getByRole("menuitem", { name: "Rename" }).click();

  await page.getByLabel("File name").fill("statement");
  await page.getByRole("button", { name: "Rename" }).click();

  await expect(cards(page).filter({ hasText: "statement.pdf" })).toHaveCount(1);
});

test("My Files Duplicate adds a copy", async ({ page }) => {
  await openCardKebab(page);
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  await expect(
    cards(page).filter({ hasText: "sample (copy).pdf" }),
  ).toHaveCount(1);
});
