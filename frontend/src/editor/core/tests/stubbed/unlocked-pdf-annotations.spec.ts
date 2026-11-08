import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "node:path";

const fixtures = path.join(import.meta.dirname, "../test-fixtures");

async function unlockFixture(page: Page, filename: string) {
  await page.goto("/annotate", { waitUntil: "domcontentloaded" });
  await page.getByTestId("files-button").click();
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(fixtures, filename));
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await dialog
      .getByLabel("Password to open", { exact: true })
      .fill("annotation-test");
    await expect(
      dialog.getByRole("button", { name: "Open PDF", exact: true }),
    ).toBeEnabled({ timeout: 1000 });
  }).toPass();
  await dialog.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(dialog).toBeHidden();
}

test("unlocked annotations render before opening comments and remain read-only", async ({
  page,
}) => {
  await unlockFixture(page, "encrypted-annotations.pdf");

  const firstPage = page.locator('[data-page-index="0"]').first();
  const annotations = firstPage.locator("[data-no-interaction]");
  await expect(annotations).toHaveCount(4, { timeout: 30_000 });
  await expect(annotations.first().locator("img")).toBeVisible();
  await expect
    .poll(() =>
      annotations
        .locator("img")
        .evaluateAll((images: HTMLImageElement[]) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Highlight", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage protection", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const comments = page.locator(".comments-sidebar");
  await expect(comments).toBeVisible();
  await expect(comments.locator("[data-comment-card]")).toHaveCount(12);
  await expect(comments).toContainText("Annotation A on page 1");
  await expect(
    comments.locator("textarea, input:not([placeholder='Search comments'])"),
  ).toHaveCount(0);
  await expect(
    comments.getByRole("button", { name: /More actions|Add comment/ }),
  ).toHaveCount(0);
  await comments
    .getByRole("button", { name: "Locate in document" })
    .first()
    .click();
  await expect(page.locator("[data-annotation-selection-menu]")).toHaveCount(0);
  await page.keyboard.press("Delete");
  await expect(comments.locator("[data-comment-card]")).toHaveCount(12);
  await comments
    .getByRole("button", { name: "Close comments sidebar" })
    .click();
  await expect(comments).toBeHidden();
  await expect(annotations).toHaveCount(4);
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  await expect(comments).toBeVisible();
  await expect(comments.locator("[data-comment-card]")).toHaveCount(12);

  await page.getByTestId("files-button").click();
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(fixtures, "annotations_out_of_order.pdf"));
  await expect(
    page.getByRole("button", { name: "Highlight", exact: true }),
  ).toBeVisible();
  await expect(comments.getByPlaceholder("Add reply...").first()).toBeVisible();
  await expect(
    comments.getByRole("button", { name: "More actions" }).first(),
  ).toBeVisible();
});

test("unlocked links remain navigable and text selection offers reading actions only", async ({
  page,
}) => {
  await unlockFixture(page, "encrypted-links.pdf");
  const firstPage = page.locator('[data-page-index="0"]').first();
  const links = firstPage.locator(".pdf-link-overlay");
  await expect(links).toHaveCount(4, { timeout: 30_000 });
  await links.first().hover();
  const linkToolbar = page.locator(".pdf-link-toolbar");
  await expect(linkToolbar).toBeVisible();
  await expect(
    linkToolbar.getByRole("button", { name: "Delete link" }),
  ).toHaveCount(0);
  await expect(linkToolbar.locator(".pdf-link-toolbar-btn--go")).toBeEnabled();

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("PDF page has no bounds");
  const y = box.y + box.height * 0.042;
  await page.mouse.move(box.x + box.width * 0.065, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();
  const selectionMenu = page.locator("[data-text-selection-menu]");
  await expect(selectionMenu).toBeVisible();
  await expect(
    selectionMenu.getByRole("button", { name: "Copy", exact: true }),
  ).toBeVisible();
  // A password-opened document is view-only, so the menu offers reading actions
  // only: copy, plus read aloud when the browser can speak.
  const canSpeak = await page.evaluate(() => "speechSynthesis" in window);
  await expect(selectionMenu.getByRole("button")).toHaveCount(canSpeak ? 2 : 1);
});
