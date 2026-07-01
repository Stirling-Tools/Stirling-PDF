import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page, Route } from "@playwright/test";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

// Base backend SignatureValidationResult; tests override the trust-related fields.
const baseResult = {
  valid: true,
  chainValid: true,
  trustValid: true,
  notExpired: true,
  selfSigned: false,
  revocationStatus: "good",
  revocationChecked: true,
  validationTimeSource: "signing-time",
  signerName: "Test Signer",
  signatureDate: "Sat Jun 21 00:00:00 BST 2026",
  reason: "Approval",
  location: "London",
  issuerDN: "CN=Some CA",
  subjectDN: "CN=Test Signer",
  serialNumber: "abc",
  validFrom: "Wed Jan 01 00:00:00 BST 2025",
  validUntil: "Fri Jan 01 00:00:00 BST 2027",
  signatureAlgorithm: "SHA256withRSA",
  keySize: 2048,
  version: "3",
  keyUsages: ["Digital Signature"],
  errorMessage: null,
};

async function mockValidate(page: Page, override: Record<string, unknown>) {
  await page.route("**/api/v1/security/validate-signature", (route: Route) =>
    route.fulfill({ json: [{ ...baseResult, ...override }] }),
  );
}

async function runValidation(page: Page) {
  await page.goto("/validate-signature");
  await page.waitForLoadState("domcontentloaded");
  await uploadFiles(page, SAMPLE_PDF);
  await page
    .getByRole("button", { name: /validate signatures/i })
    .first()
    .click();
}

test.describe("Validate Signature - trust surfacing", () => {
  test("self-signed signature is shown as valid-but-unverified, not a clean Valid", async ({
    page,
  }) => {
    await mockValidate(page, {
      valid: true,
      selfSigned: true,
      chainValid: false,
      trustValid: false,
    });

    await runValidation(page);

    await expect(page.getByText(/signer not verified/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("fully trusted signature does not show the unverified warning", async ({
    page,
  }) => {
    await mockValidate(page, {
      valid: true,
      selfSigned: false,
      chainValid: true,
      trustValid: true,
    });

    await runValidation(page);

    // Wait for the report to render (signer surfaces in the details), then
    // assert the untrusted warning is absent.
    await expect(page.getByText("Test Signer").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/signer not verified/i)).toHaveCount(0);
  });

  test("cryptographically broken signature is shown as Invalid", async ({
    page,
  }) => {
    await mockValidate(page, { valid: false });

    await runValidation(page);

    await expect(page.getByText(/^invalid$/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
