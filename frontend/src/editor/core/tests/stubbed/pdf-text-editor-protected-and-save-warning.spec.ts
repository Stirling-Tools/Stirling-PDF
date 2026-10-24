import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";
import { readFile, writeFile } from "node:fs/promises";
import { readPdfProtection } from "@editor/tests/helpers/pdf-protection";
import { PDFDocument } from "@cantoo/pdf-lib";

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
  test("saves a protected workbench PDF without uploading it for inspection", async ({
    page,
  }) => {
    await page.route("**/encode-charcodes", (route) => route.abort());
    await page.goto("/editor");
    await page.locator('[data-testid="file-input"]').setInputFiles(ENCRYPTED);
    await page
      .getByLabel("Password to open", { exact: true })
      .fill(ENCRYPTED_PASSWORD);
    await page.getByRole("button", { name: "Open PDF", exact: true }).click();
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
    const savedPath = test.info().outputPath("encrypted_edited.pdf");
    await download.saveAs(savedPath);
    const source = await readPdfProtection(
      await readFile(ENCRYPTED),
      ENCRYPTED_PASSWORD,
    );
    expect(
      await readPdfProtection(await readFile(savedPath), ENCRYPTED_PASSWORD),
    ).toMatchObject(source);
    await expect(
      readPdfProtection(await readFile(savedPath), "wrong-password"),
    ).rejects.toThrow("PDF open failed");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeHidden();
  });

  test("keeps an unlocked signed PDF out of the text editor", async ({
    page,
  }, testInfo) => {
    const pdf = await PDFDocument.load(await readFile(SIGNED));
    pdf.encrypt({
      userPassword: ENCRYPTED_PASSWORD,
      ownerPassword: ENCRYPTED_PASSWORD,
    });
    const signedProtected = testInfo.outputPath("signed-protected.pdf");
    await writeFile(signedProtected, await pdf.save());

    await page.goto("/editor");
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles(signedProtected);
    await page
      .getByLabel("Password to open", { exact: true })
      .fill(ENCRYPTED_PASSWORD);
    await page.getByRole("button", { name: "Open PDF", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("link", { name: "PDF Text Editor", exact: true })
      .first()
      .click();
    await expect(
      page.getByText(
        "This signed PDF can be viewed, but cannot be edited here.",
      ),
    ).toBeVisible();
    await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
  });

  test("wrong password re-prompts, correct password opens the document", async ({
    page,
  }) => {
    test.setTimeout(90_000);

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

  test("closing the unlock prompt does not load a document", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoEditor(page);
    await upload(page, ENCRYPTED);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
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
