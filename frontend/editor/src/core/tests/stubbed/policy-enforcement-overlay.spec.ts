import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";
import type { Page } from "@playwright/test";

/**
 * Verifies the PolicyEnforcementOverlay that blocks the viewer while a per-file
 * policy run is in progress. Settled runs (COMPLETED, FAILED, CANCELLED) never
 * block — enforcement only holds the file while the outcome is undecided.
 *
 * The overlay is rendered by the proprietary Viewer shadow
 * (src/proprietary/components/viewer/Viewer.tsx), which wraps CoreViewer and
 * injects the overlay based on the active file's policy run state.
 *
 * Test strategy:
 *   1. Upload a PDF so the viewer assigns an activeFileId (UUID, unpredictable).
 *   2. Read that ID from the `data-file-id` attribute on the viewer-root element.
 *   3. Inject a PolicyRunRecord into policyRunStore via localStorage +
 *      a manual StorageEvent (the store's storage listener re-reads on that event).
 *   4. Assert the expected overlay UI.
 *
 * Backend-free spec.
 */

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");
const STORAGE_KEY = "stirling-policy-runs";

async function uploadAndRender(page: Page) {
  await page.goto("/read", { waitUntil: "domcontentloaded" });
  await page
    .locator('[data-testid="file-input"]')
    .first()
    .setInputFiles(SAMPLE_PDF);
  // Wait for the page-count indicator — reliable signal that the PDF rendered.
  await expect(page.getByText(/\/\s*1/).first()).toBeVisible({
    timeout: 30_000,
  });
}

async function getActiveFileId(page: Page): Promise<string> {
  const fileId = await page
    .locator('[data-testid="viewer-root"]')
    .getAttribute("data-file-id");
  if (!fileId)
    throw new Error("viewer-root[data-file-id] is empty after upload");
  return fileId;
}

async function injectPolicyRun(
  page: Page,
  fileId: string,
  run: Record<string, unknown>,
) {
  const payload = JSON.stringify({
    runs: [
      {
        runId: "run-test-001",
        categoryId: "cat-security",
        fileId,
        fileName: "sample.pdf",
        fileSize: 1024,
        target: "saas",
        outputs: [],
        error: null,
        startedAt: 1720000000000,
        ...run,
      },
    ],
    dispatched: [`cat-security:${fileId}`],
  });

  // Write to localStorage, then dispatch a StorageEvent so the store's
  // window.addEventListener("storage", ...) handler picks up the new state.
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value);
      window.dispatchEvent(
        new StorageEvent("storage", { key, newValue: value }),
      );
    },
    { key: STORAGE_KEY, value: payload },
  );
}

test.describe("PolicyEnforcementOverlay — viewer blocking", () => {
  test("shows loading overlay while run is RUNNING", async ({ page }) => {
    await uploadAndRender(page);
    const fileId = await getActiveFileId(page);
    await injectPolicyRun(page, fileId, { status: "RUNNING" });

    await expect(page.getByText("Enforcing policy…")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("shows progress bar when currentStep/stepCount are set", async ({
    page,
  }) => {
    await uploadAndRender(page);
    const fileId = await getActiveFileId(page);
    await injectPolicyRun(page, fileId, {
      status: "RUNNING",
      currentStep: 2,
      stepCount: 5,
    });

    await expect(page.getByText("Enforcing policy…")).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole("progressbar")).toBeVisible();
  });

  test("shows loading overlay while run is PENDING", async ({ page }) => {
    await uploadAndRender(page);
    const fileId = await getActiveFileId(page);
    await injectPolicyRun(page, fileId, { status: "PENDING" });

    await expect(page.getByText("Enforcing policy…")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("does not block for a FAILED run", async ({ page }) => {
    await uploadAndRender(page);
    const fileId = await getActiveFileId(page);
    await injectPolicyRun(page, fileId, {
      status: "FAILED",
      error: "File contains restricted content",
    });

    await expect(page.getByText("Enforcing policy…")).not.toBeVisible();
  });

  test("does not block for a CANCELLED run", async ({ page }) => {
    await uploadAndRender(page);
    const fileId = await getActiveFileId(page);
    await injectPolicyRun(page, fileId, { status: "CANCELLED" });

    await expect(page.getByText("Enforcing policy…")).not.toBeVisible();
  });

  test("hides overlay for a COMPLETED run", async ({ page }) => {
    await uploadAndRender(page);
    const fileId = await getActiveFileId(page);
    await injectPolicyRun(page, fileId, { status: "COMPLETED" });

    await expect(page.getByText("Enforcing policy…")).not.toBeVisible();
  });

  test("hides overlay when no policy runs exist", async ({ page }) => {
    await uploadAndRender(page);

    await expect(page.getByText("Enforcing policy…")).not.toBeVisible();
  });
});
