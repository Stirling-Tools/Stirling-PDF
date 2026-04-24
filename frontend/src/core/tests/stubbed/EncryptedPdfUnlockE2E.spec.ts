/**
 * End-to-End Tests for Encrypted PDF Password Prompting
 *
 * Tests the EncryptedPdfUnlockModal flow when uploading password-protected PDFs.
 * All backend API calls are mocked via page.route() — no real backend required.
 * The Vite dev server must be running (handled by playwright.config.ts webServer).
 */

import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const ENCRYPTED_PDF = path.join(FIXTURES_DIR, "encrypted.pdf");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

// Minimal valid PDF returned by the mocked remove-password endpoint
const FAKE_UNLOCKED_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n" +
    "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n" +
    "0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF",
);

// ---------------------------------------------------------------------------
// Helper: mock all standard app APIs needed to load the main UI
// ---------------------------------------------------------------------------
async function mockAppApis(page: Page) {
  await page.route("**/api/v1/info/status", (route) =>
    route.fulfill({ json: { status: "UP" } }),
  );

  await page.route("**/api/v1/config/app-config", (route) =>
    route.fulfill({
      json: {
        enableLogin: false,
        languages: ["en-GB"],
        defaultLocale: "en-GB",
      },
    }),
  );

  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: "testuser",
        email: "test@example.com",
        roles: ["ROLE_USER"],
      },
    }),
  );

  await page.route("**/api/v1/config/endpoints-availability", (route) =>
    route.fulfill({ json: {} }),
  );

  await page.route("**/api/v1/config/endpoint-enabled*", (route) =>
    route.fulfill({ json: true }),
  );

  await page.route("**/api/v1/config/group-enabled*", (route) =>
    route.fulfill({ json: true }),
  );

  await page.route("**/api/v1/ui-data/footer-info", (route) =>
    route.fulfill({ json: {} }),
  );

  await page.route("**/api/v1/proprietary/**", (route) =>
    route.fulfill({ json: {} }),
  );
}

// ---------------------------------------------------------------------------
// Helper: mock the remove-password endpoint to succeed
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helper: mock the remove-password endpoint to fail with wrong password
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helper: upload a file through the Files modal and wait for it to close
// ---------------------------------------------------------------------------
async function uploadFile(page: Page, filePath: string) {
  await page.getByTestId("files-button").click();
  await page.waitForSelector(".mantine-Modal-overlay", {
    state: "visible",
    timeout: 5000,
  });
  await page.locator('[data-testid="file-input"]').setInputFiles(filePath);
  // Modal auto-closes after file is selected
  await page.waitForSelector(".mantine-Modal-overlay", {
    state: "hidden",
    timeout: 10000,
  });
}

// ---------------------------------------------------------------------------
// Helper: upload encrypted file — the Files modal closes, then the unlock
// modal should appear on top. We don't wait for the Files modal to vanish
// since the unlock modal may appear while it is still closing.
// ---------------------------------------------------------------------------
async function uploadEncryptedFile(page: Page, filePath: string) {
  await page.getByTestId("files-button").click();
  await page.waitForSelector(".mantine-Modal-overlay", {
    state: "visible",
    timeout: 5000,
  });
  await page.locator('[data-testid="file-input"]').setInputFiles(filePath);
}

// ---------------------------------------------------------------------------
// Selectors for the unlock modal (Mantine Modal with known text content)
// ---------------------------------------------------------------------------
const MODAL_TITLE = "Remove password to continue";
const PASSWORD_PLACEHOLDER = "Enter the PDF password";
const UNLOCK_BUTTON_TEXT = "Unlock & Continue";
const SKIP_BUTTON_TEXT = "Skip for now";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe.configure({ mode: "serial" });

test.describe("Encrypted PDF Unlock Modal", () => {
  test.beforeEach(async ({ page }) => {
    await mockAppApis(page);
    await page.goto("/?bypassOnboarding=true");
    await page.waitForSelector('[data-testid="files-button"]', {
      timeout: 10000,
    });

    // Dismiss onboarding tooltip if it appears (can block clicks in Firefox/WebKit)
    const tooltip = page.locator('button:has-text("Close tooltip")');
    if (await tooltip.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tooltip.click();
    }
  });

  test("uploading an encrypted PDF shows the unlock modal", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);

    // The unlock modal should appear with the expected title
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(PASSWORD_PLACEHOLDER)).toBeVisible();
    await expect(
      page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: SKIP_BUTTON_TEXT }),
    ).toBeVisible();
  });

  test("unlock button is disabled when password field is empty", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);

    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    const unlockBtn = page.getByRole("button", { name: UNLOCK_BUTTON_TEXT });
    await expect(unlockBtn).toBeDisabled();
  });

  test("unlock button becomes enabled after entering a password", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);

    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    const passwordInput = page.getByPlaceholder(PASSWORD_PLACEHOLDER);
    await passwordInput.fill("somepassword");

    const unlockBtn = page.getByRole("button", { name: UNLOCK_BUTTON_TEXT });
    await expect(unlockBtn).toBeEnabled();
  });

  test("successful unlock removes the modal and shows success alert", async ({
    page,
  }) => {
    await mockRemovePasswordSuccess(page);

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill("testpass123");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();

    // Modal should close after successful unlock
    await expect(page.getByText(MODAL_TITLE)).toBeHidden({ timeout: 10000 });

    // Success alert should appear
    await expect(
      page.getByText("Password removed", { exact: true }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("incorrect password shows error message in modal", async ({ page }) => {
    await mockRemovePasswordWrongPassword(page);

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill("wrongpassword");
    await page.getByRole("button", { name: UNLOCK_BUTTON_TEXT }).click();

    // Error message should appear within the modal
    await expect(page.getByText("Incorrect password")).toBeVisible({
      timeout: 5000,
    });

    // Modal should remain open
    await expect(page.getByText(MODAL_TITLE)).toBeVisible();
  });

  test("skip button closes the modal without unlocking", async ({ page }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: SKIP_BUTTON_TEXT }).click();

    // Modal should close
    await expect(page.getByText(MODAL_TITLE)).toBeHidden({ timeout: 5000 });
  });

  test("pressing Enter in password field triggers unlock", async ({ page }) => {
    await mockRemovePasswordSuccess(page);

    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    const passwordInput = page.getByPlaceholder(PASSWORD_PLACEHOLDER);
    await passwordInput.fill("testpass123");
    await passwordInput.press("Enter");

    // Modal should close after successful unlock via Enter key
    await expect(page.getByText(MODAL_TITLE)).toBeHidden({ timeout: 10000 });
  });

  test("uploading a normal PDF does not show the unlock modal", async ({
    page,
  }) => {
    await uploadFile(page, SAMPLE_PDF);

    // Wait for the file to finish processing, then verify no unlock modal appeared
    await page.waitForTimeout(3000);
    await expect(page.getByText(MODAL_TITLE)).toBeHidden();
  });

  test("unlock all button is hidden with only one encrypted file", async ({
    page,
  }) => {
    await uploadEncryptedFile(page, ENCRYPTED_PDF);
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });

    // The "Use for all" button should NOT appear with only one file
    await expect(
      page.getByRole("button", { name: /Use for all/ }),
    ).toBeHidden();
  });

  test("unlock all button appears with multiple encrypted files and unlocks all", async ({
    page,
  }) => {
    await mockRemovePasswordSuccess(page);

    // Upload two encrypted files at once (different names to avoid deduplication)
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

    // The unlock modal should appear for the first file with "Use for all" visible
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });
    const unlockAllBtn = page.getByRole("button", { name: /Use for all/ });
    await expect(unlockAllBtn).toBeVisible({ timeout: 10000 });

    // Enter password and click unlock all
    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill("testpass123");
    await unlockAllBtn.click();

    // Modal should close — all files unlocked
    await expect(page.getByText(MODAL_TITLE)).toBeHidden({ timeout: 10000 });
  });

  test("unlock all with wrong password shows which files failed", async ({
    page,
  }) => {
    await mockRemovePasswordWrongPassword(page);

    // Upload two encrypted files at once (different names to avoid deduplication)
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

    // The unlock modal should appear with "Use for all"
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 10000 });
    const unlockAllBtn = page.getByRole("button", { name: /Use for all/ });
    await expect(unlockAllBtn).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill("wrongpassword");
    await unlockAllBtn.click();

    // Modal should remain open with error about failed files
    await expect(page.getByText(MODAL_TITLE)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Wrong password for/)).toBeVisible({
      timeout: 5000,
    });
  });
});
