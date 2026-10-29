import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

// PDFium cannot parse this header, but the server's parser can; see generate-damaged-sample.py.
const damaged = path.join(
  import.meta.dirname,
  "../test-fixtures/damaged-header.pdf",
);
const sample = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

test("a damaged PDF is labelled and repaired from the viewer", async ({
  page,
}) => {
  const repaired = await readFile(sample);
  const uploads: number[] = [];
  await page.route("**/api/v1/misc/repair", async (route) => {
    uploads.push(route.request().postDataBuffer()?.length ?? 0);
    await route.fulfill({
      contentType: "application/pdf",
      body: repaired,
      headers: { "content-disposition": 'attachment; filename="repaired.pdf"' },
    });
  });

  await page.getByTestId("file-input").setInputFiles(damaged);

  const message = page.getByRole("alert").filter({ hasText: /damaged/ });
  await expect(message).toBeVisible();
  await expect(page.getByText("Damaged", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Repair", exact: true }).click();
  // Repair runs in place: no tool panel, the repaired version replaces the file.
  await expect(page.getByText("Repaired damaged-header.pdf")).toBeVisible();

  expect(uploads, "the damaged bytes reach the server").toHaveLength(1);
  await expect(page.getByText("Damaged", { exact: true })).toHaveCount(0);
  await expect(message).toHaveCount(0);
});

/** Hover the row (the kebab only shows on hover) and open its menu. */
async function openRowMenu(page: Page, name: string) {
  const row = page.locator(".file-sidebar-file-item").filter({ hasText: name });
  await row.hover();
  await row.locator(".file-sidebar-kebab-btn").click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  return { row, menu };
}

test("the file menu offers Repair for a damaged file", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles(damaged);
  const row = page
    .locator(".file-sidebar-file-item")
    .filter({ hasText: "damaged-header.pdf" });
  // Damage is known only once hydration has parsed the file.
  await expect(row.getByText("Damaged", { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  const { menu } = await openRowMenu(page, "damaged-header.pdf");
  await expect(menu.getByRole("menuitem", { name: "Repair" })).toBeVisible();
});

test("the file menu offers no Repair for a healthy file", async ({ page }) => {
  await page.getByTestId("file-input").setInputFiles(sample);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 20_000,
  });
  const { menu } = await openRowMenu(page, "sample.pdf");
  await expect(menu.getByRole("menuitem", { name: "Repair" })).toHaveCount(0);
});

test.describe("when the server has Repair disabled", () => {
  test.use({
    stubOptions: { endpointsAvailability: { repair: { enabled: false } } },
  });

  test("the damage is still shown but no Repair action is offered", async ({
    page,
  }) => {
    await page.getByTestId("file-input").setInputFiles(damaged);
    await expect(
      page.getByRole("alert").filter({ hasText: /damaged/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Repair", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Retry", exact: true }),
    ).toBeVisible();
  });
});

test("the Active Files card shows the damage and repairs it", async ({
  page,
}) => {
  const uploads: number[] = [];
  await page.route("**/api/v1/misc/repair", async (route) => {
    uploads.push(1);
    await route.fulfill({
      contentType: "application/pdf",
      body: await readFile(sample),
    });
  });
  await page.getByTestId("file-input").setInputFiles([damaged, sample]);
  const card = page
    .getByTestId("file-thumbnail")
    .filter({ hasText: "damaged-header.pdf" });
  await expect(card.getByText("Damaged", { exact: true })).toBeVisible();
  await expect(card.getByText(/Loading thumbnail/)).toHaveCount(0);
  const healthy = page
    .getByTestId("file-thumbnail")
    .filter({ hasText: "sample.pdf" });
  await expect(healthy.getByRole("button", { name: "Repair" })).toHaveCount(0);

  // Both the overlay and the hover bar offer Repair; the hover bar is the card's usual action surface.
  await card.hover();
  await card
    .locator("[data-hover-action-menu]")
    .getByRole("button", { name: "Repair", exact: true })
    .click();
  // Repair runs in place: no tool panel, the repaired version replaces the file.
  await expect(page.getByText("Repaired damaged-header.pdf")).toBeVisible();
  expect(uploads).toHaveLength(1);
  await expect(page.getByText("Damaged", { exact: true })).toHaveCount(0);
});

test("a failed repair says so and keeps the file marked damaged", async ({
  page,
}) => {
  await page.route("**/api/v1/misc/repair", (route) =>
    route.fulfill({ status: 500, json: { message: "Repair failed" } }),
  );
  await page.getByTestId("file-input").setInputFiles(damaged);
  await page.getByRole("button", { name: "Repair", exact: true }).click();
  await expect(
    page.getByText("Couldn't repair damaged-header.pdf"),
  ).toBeVisible();
  await expect(page.getByText("Damaged", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Repair", exact: true }),
  ).toBeEnabled();
});
