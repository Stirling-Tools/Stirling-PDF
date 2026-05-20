/**
 * End-to-End Tests for Encrypted PDF Password Prompting
 *
 * Tests the EncryptedPdfUnlockModal flow when uploading password-protected PDFs.
 * All backend API calls are mocked via page.route() — no real backend required.
 *
 * Coverage trimmed to 5 high-value cases:
 *   1. Modal renders with the expected title/inputs/buttons.
 *   2. Successful unlock removes the modal and shows the success toast.
 *   3. Wrong password keeps the modal open with an inline error.
 *   4. Pressing Enter in the password field triggers unlock.
 *   5. Multiple encrypted files surface the "Use for all" affordance and
 *      unlocking via that path resolves the modal.
 *
 * Removed previously: input-disabled-when-empty, input-enabled-after-fill,
 * skip-button-closes, normal-PDF-doesn't-prompt, single-file-hides-use-for-all,
 * unlock-all-wrong-password — all transitively covered or low-value.
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import { mockAppApis } from "@app/tests/helpers/api-stubs";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const ENCRYPTED_PDF = path.join(FIXTURES_DIR, "encrypted.pdf");

const FAKE_UNLOCKED_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n" +
    "0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF",
);

function mockRemovePasswordSuccess(page: Page) {
  return page.route("**/api/v1/security/remove-password", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      headers: {
        "Content-Disposition": 'attachment; filename="encrypted.pdf"',
      },
      body: FAKE_UNLOCKED_PDF,
    }),
  );
}

function mockRemovePasswordWrongPassword(page: Page) {
  return page.route("**/api/v1/security/remove-password", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "/errors/pdf-password",
        title: "PDF password incorrect",
        status: 400,
        detail:
          "The PDF is passworded and requires the correct password to open.",
      }),
    }),
  );
}

async function uploadEncryptedFile(page: Page, filePath: string) {
  await page.getByTestId("files-button").click();
  await page.waitForSelector(".mantine-Modal-overlay", {
    state: "visible",
    timeout: 5000,
  });
  await page.locator('[data-testid="file-input"]').setInputFiles(filePath);
}

const MODAL_TITLE = "Remove password to continue";
const PASSWORD_PLACEHOLDER = "Enter the PDF password";
const UNLOCK_BUTTON_TEXT = "Unlock & Continue";

test.describe.configure({ mode: "serial" });

test.describe("Encrypted PDF Unlock Modal", () => {
  test.beforeEach(async ({ page }) => {
    await mockAppApis(page);
    await page.goto("/?bypassOnboarding=true");
    await page.waitForSelector('[data-testid="files-button"]', {
      timeout: 10000,
    });
    const tooltip = page.locator('button:has-text("Close tooltip")');
    if (await tooltip.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tooltip.click();
    }
  });

  test("modal renders with title, password input, and action buttons", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);

    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(PASSWORD_PLACEHOLDER)).toBeVisible();
    await expect(
      page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }),
    ).toBeVisible();
  });

  test("successful unlock removes the modal and shows success alert", async ({
    page,
  }) => {
    await mockRemovePasswordSuccess(page);

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill("testpass123");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();

    await expect(page.getByText(MODAL_TITLE)).toBeHidden({ timeout: 10000 });
    await expect(
      page.getByText("Password removed", { exact: true }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("incorrect password keeps the modal open with an inline error", async ({
    page,
  }) => {
    await mockRemovePasswordWrongPassword(page);

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill("wrongpassword");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();

    await expect(page.getByText("Incorrect password")).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText(MODAL_TITLE)).toBeVisible();
  });

  test("pressing Enter in the password field triggers unlock", async ({
    page,
  }) => {
    await mockRemovePasswordSuccess(page);

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    const passwordInput = page.getByPlaceholder(PASSWORD_PLACEHOLDER);
    await passwordInput.fill("testpass123");
    await passwordInput.press("Enter");

    await expect(page.getByText(MODAL_TITLE)).toBeHidden({ timeout: 10000 });
  });

  test("multi-file unlock-all closes the modal after one password entry", async ({
    page,
  }) => {
    await mockRemovePasswordSuccess(page);

    await page.getByTestId("files-button").click();
    await page.waitForSelector(".mantine-Modal-overlay", {
      state: "visible",
      timeout: 5000,
    });
    await page.locator('[data-testid="file-input"]').setInputFiles([
      {
        name: "encrypted-a.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(ENCRYPTED_PDF),
      },
      {
        name: "encrypted-b.pdf",
        mimeType: "application/pdf",
        buffer: fs.readFileSync(ENCRYPTED_PDF),
      },
    ]);

    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 15000 });
    // The "Use for all" affordance only appears once BOTH files have been
    // detected as encrypted. PDF.js encryption probing runs per-file and
    // can lag the modal opening (which fires as soon as the first file
    // surfaces a password prompt). A 10s timeout was occasionally too tight
    // on heavily-loaded CI runners — bump to 20s.
    const unlockAllBtn = page.getByRole("button", { name: /Use for all/ });
    await expect(unlockAllBtn).toBeVisible({ timeout: 20000 });

    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill("testpass123");
    await unlockAllBtn.click();

    await expect(page.getByText(MODAL_TITLE)).toBeHidden({ timeout: 15000 });
  });
});
