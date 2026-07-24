import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

/**
 * Full-stack round-trip for the form field editor (PR #5777). Runs against a
 * real Spring Boot backend (the `live` Playwright project): a field drawn in
 * the browser is created by PDFBox, the viewer reloads the produced PDF, and
 * the new field is then visible in modify mode and removable again.
 *
 * The stubbed spec (`stubbed/form-field-editing.spec.ts`) covers the UI/API
 * contract without a backend; this one proves the bytes actually round-trip.
 */

function fixture(filename: string): string {
  const candidates = [
    path.resolve(
      process.cwd(),
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
    path.resolve(
      process.cwd(),
      "frontend",
      "editor",
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Test fixture not found: ${filename}`);
}

function modeTab(page: Page, name: string) {
  return page
    .locator(".mantine-SegmentedControl-label")
    .filter({ hasText: name });
}

test.describe("Form field editor — live round-trip", () => {
  test.describe.configure({ timeout: 120000 });

  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test("creates a field on the backend and shows it in modify mode", async ({
    page,
  }) => {
    await page.goto("/form-fill");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, [fixture("sample.pdf")]);

    // --- Create a text field by drawing on the rendered page ---
    await modeTab(page, "Create").click();
    await page.getByTestId("form-create-type-text").click();

    const overlay = page.getByTestId("form-create-overlay-0");
    await expect(overlay).toBeVisible({ timeout: 30_000 });
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width * 0.3;
    const y = box!.y + box!.height * 0.3;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 140, y + 36, { steps: 8 });
    await page.mouse.up();

    const commit = page.getByTestId("form-create-commit");
    await expect(commit).toBeEnabled();
    await commit.click();

    // After the backend creates the field, the viewer reloads the PDF and the
    // tool re-fetches fields. Modify mode should now list at least one field.
    await modeTab(page, "Modify").click();
    const rows = page.locator('[data-testid^="form-modify-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
  });

  test("deletes an existing field through the backend", async ({ page }) => {
    await page.goto("/form-fill");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, [fixture("sample.pdf")]);

    // Seed a field so there is something to delete (independent of fixtures).
    await modeTab(page, "Create").click();
    await page.getByTestId("form-create-type-text").click();
    const overlay = page.getByTestId("form-create-overlay-0");
    await expect(overlay).toBeVisible({ timeout: 30_000 });
    const box = await overlay.boundingBox();
    const x = box!.x + box!.width * 0.3;
    const y = box!.y + box!.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 120, y + 30, { steps: 6 });
    await page.mouse.up();
    await page.getByTestId("form-create-commit").click();

    // Switch to modify, mark every field for deletion, commit.
    await modeTab(page, "Modify").click();
    const rows = page.locator('[data-testid^="form-modify-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    const initialCount = await rows.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);

    await page.locator('[data-testid^="form-modify-delete-"]').first().click();
    const commit = page.getByTestId("form-modify-commit");
    await expect(commit).toBeEnabled();
    await commit.click();

    // The reloaded PDF should expose fewer fields than before.
    await expect
      .poll(async () => rows.count(), { timeout: 30_000 })
      .toBeLessThan(initialCount);
  });
});
