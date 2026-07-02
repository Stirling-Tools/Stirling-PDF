import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";

/**
 * Coverage for two save/open safety features:
 *  - Encrypted PDFs prompt for a password and decrypt client-side (PDFium),
 *    re-prompting on a wrong password rather than dead-ending.
 *  - Saving a document that carries digital signatures (or XFA) warns first,
 *    because PDFium's full rewrite would invalidate them.
 *
 * Assertions target the modals' inner controls (buttons / inputs / text),
 * not the Mantine Modal ROOT wrapper - that root persists in the DOM and is a
 * zero-size positioning element, so toBeVisible()/count() on it is unreliable.
 *
 * Backend-free: encode-charcodes is aborted so nothing depends on a server.
 */

const ENCRYPTED = path.join(__dirname, "../test-fixtures/encrypted.pdf");
const SIGNED = path.join(__dirname, "../test-fixtures/signed-sample.pdf");
const SAMPLE = path.join(__dirname, "../test-fixtures/sample.pdf");
const ENCRYPTED_PASSWORD = "testpass123";

async function gotoEditor(page: Page): Promise<void> {
  await page.route("**/encode-charcodes", (route: Route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
}

async function upload(page: Page, file: string): Promise<void> {
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
}

test.describe("v2 editor - encrypted PDF password prompt", () => {
  test("wrong password re-prompts, correct password opens the document", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoEditor(page);
    await upload(page, ENCRYPTED);

    const submit = page.getByTestId("v2-password-submit");
    await expect(submit).toBeVisible({ timeout: 20_000 });
    const input = page
      .getByTestId("v2-password-modal")
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
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("cancel dismisses the prompt without loading a document", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoEditor(page);
    await upload(page, ENCRYPTED);

    const cancel = page.getByTestId("v2-password-cancel");
    await expect(cancel).toBeVisible({ timeout: 20_000 });
    await cancel.click();
    await expect(cancel).toBeHidden();
    expect(await page.getByTestId("v2-page-0").count()).toBe(0);
  });
});

test.describe("v2 editor - pre-save data-loss warning", () => {
  test("signed PDF warns before saving, then downloads on confirm", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoEditor(page);
    await upload(page, SIGNED);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });

    // First save attempt surfaces the warning instead of downloading.
    await page.getByTestId("v2-save").click();
    const confirm = page.getByTestId("v2-save-risk-confirm");
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("v2-save-risk-modal")).toContainText(
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
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    // The warning's confirm button must never have mounted for a plain PDF.
    expect(await page.getByTestId("v2-save-risk-confirm").count()).toBe(0);
  });
});
