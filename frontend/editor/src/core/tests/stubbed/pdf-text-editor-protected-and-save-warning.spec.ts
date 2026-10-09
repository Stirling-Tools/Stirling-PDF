import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";

/** Coverage for two save/open safety features. */

const ENCRYPTED = path.join(
  import.meta.dirname,
  "../test-fixtures/encrypted.pdf",
);
const SIGNED = path.join(
  import.meta.dirname,
  "../test-fixtures/signed-sample.pdf",
);
const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");
const ENCRYPTED_PASSWORD = "testpass123";

async function gotoEditor(page: Page): Promise<void> {
  await page.route("**/encode-charcodes", (route: Route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 20_000,
  });
}

async function upload(page: Page, file: string): Promise<void> {
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(file);
}

test.describe("PDF text editor - encrypted PDF password prompt", () => {
  test("reuses the session unlock when opening and saving a workbench PDF", async ({
    page,
  }) => {
    await page.route("**/encode-charcodes", (route) => route.abort());
    let inspections = 0;
    await page.route("**/api/v1/security/inspect-pdf-security", (route) => {
      inspections++;
      return route.fulfill({
        json: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: true,
          permissions: -4,
          canModify: true,
          canAssemble: true,
          pageCount: 1,
        },
      });
    });
    await page.goto("/editor");
    await page.locator('[data-testid="file-input"]').setInputFiles(ENCRYPTED);
    await page
      .getByPlaceholder("Enter the PDF password")
      .fill(ENCRYPTED_PASSWORD);
    await page.getByRole("button", { name: "Unlock & Continue" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("link", { name: "PDF Text Editor", exact: true })
      .first()
      .click();
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("pdf-editor-password-modal")).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(inspections).toBe(1);

    await page.evaluate(() => {
      const run = document.querySelector<HTMLElement>(
        '[data-testid^="pdf-editor-run-"]',
      );
      if (!run) throw new Error("Expected an editable text run");
      run.focus();
      const range = document.createRange();
      range.selectNodeContents(run);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("insertText", false, " Test");
    });
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
    await page.getByTestId("pdf-editor-download").click();
    await expect(page.getByTestId("pdf-editor-save-risk-modal")).toContainText(
      /encryption/i,
    );
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-save-risk-confirm").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("encrypted_edited.pdf");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeHidden();
    expect(inspections).toBe(2);
  });

  test("wrong password re-prompts, correct password opens the document", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.route("**/api/v1/security/inspect-pdf-security", (route) =>
      route.fulfill({
        json: {
          encrypted: true,
          signed: false,
          ownerAuthenticated: true,
          permissions: -4,
          canModify: true,
          canAssemble: true,
          pageCount: 1,
        },
      }),
    );
    await gotoEditor(page);
    await upload(page, ENCRYPTED);

    const submit = page.getByTestId("pdf-editor-password-submit");
    await expect(submit).toBeVisible({ timeout: 20_000 });
    const input = page
      .getByTestId("pdf-editor-password-modal")
      .locator("input")
      .first();

    // Wrong password -> prompt stays, shows the retry error.
    await input.fill("definitely-wrong");
    await submit.click();
    await expect(page.getByText("Incorrect password - try again.")).toBeVisible(
      { timeout: 20_000 },
    );
    await expect(submit).toBeVisible();

    // Correct password -> prompt closes and the page renders.
    await input.fill(ENCRYPTED_PASSWORD);
    await submit.click();
    await expect(submit).toBeHidden({ timeout: 20_000 });
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole("button", { name: /^encrypted\.pdf/ }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("cancel dismisses the prompt without loading a document", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoEditor(page);
    await upload(page, ENCRYPTED);

    const cancel = page.getByTestId("pdf-editor-password-cancel");
    await expect(cancel).toBeVisible({ timeout: 20_000 });
    await cancel.click();
    await expect(cancel).toBeHidden();
    expect(await page.getByTestId("pdf-editor-page-0").count()).toBe(0);
  });
});

test.describe("PDF text editor - pre-save data-loss warning", () => {
  test("signed PDF warns before saving, then downloads on confirm", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoEditor(page);
    await upload(page, SIGNED);
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });

    // The first attempt surfaces the warning instead of downloading.
    await page.getByTestId("pdf-editor-download").click();
    const confirm = page.getByTestId("pdf-editor-save-risk-confirm");
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("pdf-editor-save-risk-modal")).toContainText(
      /signature/i,
    );

    // Confirming downloads the rewritten copy and closes the modal.
    const downloadPromise = page.waitForEvent("download");
    await confirm.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    await expect(confirm).toBeHidden();
  });

  test("a normal PDF saves without any warning", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoEditor(page);
    await upload(page, SAMPLE);
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    // The warning's confirm button must never have mounted for a plain PDF.
    expect(await page.getByTestId("pdf-editor-save-risk-confirm").count()).toBe(
      0,
    );
  });
});
