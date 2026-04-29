import { test, expect, type Page } from "@playwright/test";
import path from "path";

// ---------------------------------------------------------------------------
// Test fixtures — pre-generated keystores in test-fixtures/certs/
// ---------------------------------------------------------------------------
const CERTS_DIR = path.join(__dirname, "../test-fixtures/certs");
const VALID_P12 = path.join(CERTS_DIR, "valid-test.p12");
const EXPIRED_P12 = path.join(CERTS_DIR, "expired-test.p12");
const NOT_YET_VALID_P12 = path.join(CERTS_DIR, "not-yet-valid-test.p12");
const VALID_JKS = path.join(CERTS_DIR, "valid-test.jks");

// ---------------------------------------------------------------------------
// Stable mock data returned by the mocked backend
// ---------------------------------------------------------------------------
const MOCK_SESSION = {
  sessionId: "test-session-id",
  documentName: "test-document.pdf",
  status: "IN_PROGRESS",
  ownerUsername: "test-owner",
  message: null,
  dueDate: null,
  participants: [],
};

const MOCK_PARTICIPANT = {
  id: 1,
  email: "test@example.com",
  name: "Test User",
  status: "PENDING",
  shareToken: "test-token",
  expiresAt: null,
  hasCompleted: false,
  isExpired: false,
};

// ---------------------------------------------------------------------------
// Helper: mock the participant session and document endpoints
// (called in beforeEach so each test starts from a clean active session)
// ---------------------------------------------------------------------------
async function mockParticipantApis(page: Page) {
  // Mock auth so AppProviders/Landing don't redirect to /login
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

  await page.route("**/api/v1/workflow/participant/session**", (route) =>
    route.fulfill({ json: MOCK_SESSION }),
  );
  await page.route("**/api/v1/workflow/participant/details**", (route) =>
    route.fulfill({ json: MOCK_PARTICIPANT }),
  );
  // Minimal stub so the download-document call doesn't throw
  await page.route("**/api/v1/workflow/participant/document**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: Buffer.alloc(128),
    }),
  );
}

// ---------------------------------------------------------------------------
// Helper: set the Mantine <Select> value by opening its dropdown and clicking
// the matching option — Mantine renders a custom combobox, not a native select.
// ---------------------------------------------------------------------------
async function selectCertType(page: Page, label: string) {
  await page.getByTestId("cert-type-select").click();
  await page.getByRole("option", { name: label }).click();
}

// ---------------------------------------------------------------------------
// Helper: upload a file into the Mantine <FileInput> (hidden native input)
// ---------------------------------------------------------------------------
async function uploadCertFile(page: Page, filePath: string) {
  // Mantine FileInput uses a visually hidden <input type="file">.
  // We click the visible button to expose it, then set files via the hidden input.
  const certFileInput = page.getByTestId("cert-file-input");
  await certFileInput.click();
  // After click, the file chooser or the hidden input becomes interactive.
  // Use the first file input on the page (Mantine places it near the button).
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(filePath);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe("Certificate Validation — ParticipantView", () => {
  test.beforeEach(async ({ page }) => {
    await mockParticipantApis(page);
  });

  // 1. Happy path — valid P12
  test('valid P12 cert shows green "Certificate valid until" feedback', async ({
    page,
  }) => {
    await page.route(
      "**/api/v1/workflow/participant/validate-certificate",
      (route) =>
        route.fulfill({
          json: {
            valid: true,
            subjectName: "Test Signer",
            notAfter: "2027-01-01T00:00:00Z",
            notBefore: "2025-01-01T00:00:00Z",
            selfSigned: true,
            error: null,
          },
        }),
    );

    await page.goto("/workflow/sign/test-token");
    await page.waitForSelector('[data-testid="submit-signature-button"]');

    await uploadCertFile(page, VALID_P12);
    await page.getByTestId("cert-password-input").fill("testpass");

    // Wait for debounce (600 ms) + network round-trip
    const feedback = page.getByTestId("cert-validation-feedback");
    await expect(feedback).toContainText("Certificate valid until", {
      timeout: 5000,
    });
    await expect(feedback).toContainText("Test Signer");
  });

  // 2. Wrong password — red error
  test("wrong password shows red error message", async ({ page }) => {
    await page.route(
      "**/api/v1/workflow/participant/validate-certificate",
      (route) =>
        route.fulfill({
          json: {
            valid: false,
            subjectName: null,
            notAfter: null,
            notBefore: null,
            selfSigned: false,
            error: "Invalid certificate password or corrupt keystore file",
          },
        }),
    );

    await page.goto("/workflow/sign/test-token");
    await page.waitForSelector('[data-testid="submit-signature-button"]');

    await uploadCertFile(page, VALID_P12);
    await page.getByTestId("cert-password-input").fill("wrongpass");

    const feedback = page.getByTestId("cert-validation-feedback");
    await expect(feedback).toContainText("Invalid certificate password", {
      timeout: 5000,
    });
  });

  // 3. Expired certificate
  test('expired cert shows "Certificate has expired" error', async ({
    page,
  }) => {
    await page.route(
      "**/api/v1/workflow/participant/validate-certificate",
      (route) =>
        route.fulfill({
          json: {
            valid: false,
            subjectName: null,
            notAfter: null,
            notBefore: null,
            selfSigned: false,
            error: "Certificate has expired (expired: 2023-01-02 00:00:00 UTC)",
          },
        }),
    );

    await page.goto("/workflow/sign/test-token");
    await page.waitForSelector('[data-testid="submit-signature-button"]');

    await uploadCertFile(page, EXPIRED_P12);
    await page.getByTestId("cert-password-input").fill("testpass");

    const feedback = page.getByTestId("cert-validation-feedback");
    await expect(feedback).toContainText("Certificate has expired", {
      timeout: 5000,
    });
  });

  // 4. Not-yet-valid certificate
  test('not-yet-valid cert shows "not yet valid" error', async ({ page }) => {
    await page.route(
      "**/api/v1/workflow/participant/validate-certificate",
      (route) =>
        route.fulfill({
          json: {
            valid: false,
            subjectName: null,
            notAfter: null,
            notBefore: null,
            selfSigned: false,
            error:
              "Certificate is not yet valid (valid from: 2027-01-01 00:00:00 UTC)",
          },
        }),
    );

    await page.goto("/workflow/sign/test-token");
    await page.waitForSelector('[data-testid="submit-signature-button"]');

    await uploadCertFile(page, NOT_YET_VALID_P12);
    await page.getByTestId("cert-password-input").fill("testpass");

    const feedback = page.getByTestId("cert-validation-feedback");
    await expect(feedback).toContainText("not yet valid", { timeout: 5000 });
  });

  // 5. Submit button disabled while validating
  test("submit button is disabled while validation is in flight", async ({
    page,
  }) => {
    // Slow response so we can assert the disabled state mid-flight
    await page.route(
      "**/api/v1/workflow/participant/validate-certificate",
      async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.fulfill({
          json: {
            valid: true,
            subjectName: "Test Signer",
            notAfter: "2027-01-01T00:00:00Z",
            notBefore: "2025-01-01T00:00:00Z",
            selfSigned: true,
            error: null,
          },
        });
      },
    );

    await page.goto("/workflow/sign/test-token");
    await page.waitForSelector('[data-testid="submit-signature-button"]');

    await uploadCertFile(page, VALID_P12);
    await page.getByTestId("cert-password-input").fill("testpass");

    // Shortly after typing, validation is in flight — button must be disabled
    const submitBtn = page.getByTestId("submit-signature-button");
    await expect(submitBtn).toBeDisabled({ timeout: 3000 });

    // After validation completes the button should be re-enabled
    await expect(submitBtn).toBeEnabled({ timeout: 5000 });
  });

  // 6. SERVER type — no validation call made, button stays enabled
  test("SERVER cert type skips validation and keeps submit enabled", async ({
    page,
  }) => {
    let validateCalled = false;
    await page.route(
      "**/api/v1/workflow/participant/validate-certificate",
      (route) => {
        validateCalled = true;
        return route.fulfill({ json: { valid: true } });
      },
    );

    await page.goto("/workflow/sign/test-token");
    await page.waitForSelector('[data-testid="submit-signature-button"]');

    await selectCertType(page, "Server Certificate (if available)");

    // Wait longer than debounce to confirm no call is made
    await page.waitForTimeout(1000);

    expect(validateCalled).toBe(false);
    await expect(page.getByTestId("submit-signature-button")).toBeEnabled();
  });

  // 7. Bonus — valid JKS keystore
  test("valid JKS keystore shows green feedback", async ({ page }) => {
    await page.route(
      "**/api/v1/workflow/participant/validate-certificate",
      (route) =>
        route.fulfill({
          json: {
            valid: true,
            subjectName: "JKS Signer",
            notAfter: "2027-01-01T00:00:00Z",
            notBefore: "2025-01-01T00:00:00Z",
            selfSigned: true,
            error: null,
          },
        }),
    );

    await page.goto("/workflow/sign/test-token");
    await page.waitForSelector('[data-testid="submit-signature-button"]');

    await selectCertType(page, "JKS Keystore");
    await uploadCertFile(page, VALID_JKS);
    await page.getByTestId("cert-password-input").fill("jkspass");

    const feedback = page.getByTestId("cert-validation-feedback");
    await expect(feedback).toContainText("Certificate valid until", {
      timeout: 5000,
    });
    await expect(feedback).toContainText("JKS Signer");
  });
});
