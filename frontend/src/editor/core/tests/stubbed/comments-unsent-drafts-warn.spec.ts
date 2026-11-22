import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "node:path";

const fixtures = path.join(import.meta.dirname, "../test-fixtures");

async function openComments(page: Page) {
  await page.goto("/annotate", { waitUntil: "domcontentloaded" });
  await page.getByTestId("files-button").click();
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(fixtures, "annotation-text-sample.pdf"));
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const comments = page.locator(".comments-sidebar");
  await expect(comments.locator("[data-comment-card]")).not.toHaveCount(0);
  return comments;
}

const unsavedDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Unsaved Changes" });

test("leaving with an unsent reply asks before discarding it", async ({
  page,
}) => {
  const comments = await openComments(page);
  await comments.getByPlaceholder("Add reply...").first().fill("Unsent reply");
  await page.getByTestId("my-files-button").click();
  await expect(unsavedDialog(page)).toBeVisible({ timeout: 10_000 });
});

test("leaving with no unsent text does not ask", async ({ page }) => {
  await openComments(page);
  await page.getByTestId("my-files-button").click();
  await expect(page).toHaveURL(/\/files/);
  await expect(unsavedDialog(page)).toHaveCount(0);
});
