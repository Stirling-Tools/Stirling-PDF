import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function loadViewer(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });
  return firstPage;
}

test("the annotations button leaves annotation mode when clicked again", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await loadViewer(page);

  const toggle = page.getByTestId("annotations-toggle");
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true", {
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/annotate/);
  const highlightTool = page.getByRole("button", {
    name: "Highlight",
    exact: true,
  });
  await expect(highlightTool).toBeVisible({ timeout: 20_000 });

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false", {
    timeout: 15_000,
  });
  await expect(highlightTool).not.toBeVisible();
  await expect(page).not.toHaveURL(/\/annotate/);

  // Leaving the tool is a mode change, not a document change: the page stays
  // mounted and selectable.
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible();
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached();
});

test("exiting with pending annotations asks before leaving", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);

  const toggle = page.getByTestId("annotations-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true", {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Highlight", exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");
  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();
  const highlight = page
    .locator('[data-text-selection-menu] button[aria-label="Highlight"]')
    .first();
  await expect(highlight).toBeVisible({ timeout: 5_000 });
  await highlight.click();
  await expect(
    page.getByRole("button", { name: "Save Changes" }).first(),
  ).toBeEnabled({ timeout: 10_000 });

  await toggle.click();
  const guard = page.getByRole("dialog", {
    name: "Unsaved Changes",
    exact: true,
  });
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", { name: "Keep Working", exact: true })
    .click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await toggle.click();
  await expect(guard).toBeVisible();
  await guard
    .getByRole("button", { name: "Save & Leave", exact: true })
    .click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false", {
    timeout: 15_000,
  });
  await expect(page).not.toHaveURL(/\/annotate/);
});

const FORM_FIELDS = [
  {
    name: "firstName",
    label: "First name",
    type: "text",
    value: "",
    options: null,
    displayOptions: null,
    required: false,
    readOnly: false,
    multiSelect: false,
    multiline: false,
    tooltip: null,
    widgets: [
      {
        pageIndex: 0,
        x: 100,
        y: 100,
        width: 180,
        height: 20,
        fontSize: 12,
        cropBoxHeight: 792,
      },
    ],
  },
];

test("entering annotation mode from Form Editor keeps the save warning", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.route("**/api/v1/form/fields-with-coordinates", (route) =>
    route.fulfill({ json: FORM_FIELDS }),
  );
  await loadViewer(page);

  await page.getByRole("button", { name: "Form Editor" }).first().click();
  const field = page.getByRole("textbox", {
    name: "First name",
    exact: true,
  });
  await expect(field).toBeVisible({ timeout: 30_000 });
  await field.fill("Unsaved answer");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Save", exact: true }),
  ).toBeEnabled({ timeout: 5_000 });

  const toggle = page.getByTestId("annotations-toggle");
  await toggle.click();
  const guard = page.getByRole("dialog", {
    name: "Unsaved Changes",
    exact: true,
  });
  await expect(guard).toBeVisible({ timeout: 10_000 });
  await guard
    .getByRole("button", { name: "Keep Working", exact: true })
    .click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(field).toHaveValue("Unsaved answer");
});
