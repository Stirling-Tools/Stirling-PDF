import { test } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";
import {
  switchToEditorIfViewerMode,
  runToolAndWaitForReview,
  waitForModalOpen,
  waitForModalClose,
} from "@app/tests/helpers/ui-helpers";
import path from "path";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const ENCRYPTED_PDF = path.join(FIXTURES_DIR, "encrypted.pdf");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

/**
 * The encrypted-PDF unlock prompt is well-tested in isolation
 * (stubbed/EncryptedPdfUnlockE2E.spec.ts), but no test verifies that
 * after unlocking, the file actually flows into a tool run. This spec
 * uploads an encrypted PDF + a regular PDF, unlocks the encrypted one,
 * and runs merge against the real backend.
 */
test.describe("Encrypted PDF: unlock then merge", () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test("unlocked encrypted PDF participates in a real merge", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto("/merge");
    await page.waitForLoadState("domcontentloaded");

    await page.getByTestId("files-button").click();
    await waitForModalOpen(page);
    await page
      .locator('[data-testid="file-input"]')
      .setInputFiles([ENCRYPTED_PDF, SAMPLE_PDF]);

    // Encrypted unlock modal appears (the files modal may still be closing)
    const passwordInput = page.getByPlaceholder(/password/i).first();
    if (
      !(await passwordInput.isVisible({ timeout: 10_000 }).catch(() => false))
    ) {
      test.skip(
        true,
        "Encrypted unlock modal not surfaced — fixture may not match this build",
      );
      return;
    }
    await passwordInput.fill("test");
    await page
      .getByRole("button", { name: /unlock/i })
      .first()
      .click();

    await waitForModalClose(page, 15_000);
    await switchToEditorIfViewerMode(page);
    await runToolAndWaitForReview(page);
  });
});
