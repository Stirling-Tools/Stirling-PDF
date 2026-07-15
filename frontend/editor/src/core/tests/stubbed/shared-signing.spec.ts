import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Route } from "@playwright/test";
import path from "path";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

const FIXTURES_DIR = path.join(__dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

/** Stub the two signing list endpoints with empty arrays. */
async function stubSigningApis(page: import("@playwright/test").Page) {
  await page.route("**/api/v1/security/cert-sign/sign-requests", (r: Route) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/security/cert-sign/sessions", (r: Route) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/storage/teams/**", (r: Route) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/storage/files", (r: Route) =>
    r.fulfill({ json: [] }),
  );
}

test.describe("SharedSign tool — gating", () => {
  test("shows 'not enabled' notice when storageGroupSigningEnabled is false", async ({
    page,
  }) => {
    // Default stub has no storageGroupSigningEnabled — feature is off.
    await page.goto("/shared-sign", { waitUntil: "domcontentloaded" });
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 10_000 });
    await expect(alert).toContainText(/not enabled|collaborative signing/i);
  });
});

test.describe("SharedSign tool — feature enabled", () => {
  test.use({
    stubOptions: {
      enableLogin: true,
    },
    seedJwt: true,
  });

  test("renders Active/Completed tabs and Request signatures button", async ({
    page,
  }) => {
    // Override app-config to include storageGroupSigningEnabled.
    await page.route("**/api/v1/config/app-config", (r: Route) =>
      r.fulfill({
        json: {
          enableLogin: true,
          isAdmin: false,
          languages: ["en-US"],
          defaultLocale: "en-US",
          storageGroupSigningEnabled: true,
        },
      }),
    );
    await stubSigningApis(page);

    await page.goto("/shared-sign", { waitUntil: "domcontentloaded" });

    // Mantine SegmentedControl hides the underlying radio inputs via CSS;
    // assert on the visible label text instead.
    await expect(
      page
        .locator("label")
        .filter({ hasText: /^active$/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page
        .locator("label")
        .filter({ hasText: /^completed$/i })
        .first(),
    ).toBeVisible();

    // "Request signatures" action button should be visible.
    const requestBtn = page.getByRole("button", {
      name: /request signatures/i,
    });
    await expect(requestBtn).toBeVisible();
  });

  test("empty-state message shows when no sessions exist", async ({ page }) => {
    await page.route("**/api/v1/config/app-config", (r: Route) =>
      r.fulfill({
        json: {
          enableLogin: true,
          isAdmin: false,
          languages: ["en-US"],
          defaultLocale: "en-US",
          storageGroupSigningEnabled: true,
        },
      }),
    );
    await stubSigningApis(page);

    await page.goto("/shared-sign", { waitUntil: "domcontentloaded" });

    // Empty-state copy for the active tab.
    await expect(
      page.getByText(/no pending sign requests|no active sessions/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking 'Request signatures' shows the create-session wizard", async ({
    page,
  }) => {
    await page.route("**/api/v1/config/app-config", (r: Route) =>
      r.fulfill({
        json: {
          enableLogin: true,
          isAdmin: false,
          languages: ["en-US"],
          defaultLocale: "en-US",
          storageGroupSigningEnabled: true,
        },
      }),
    );
    await stubSigningApis(page);
    // Team members endpoint for participant picker.
    await page.route("**/api/v1/proprietary/team/**", (r: Route) =>
      r.fulfill({ json: [] }),
    );

    await page.goto("/shared-sign", { waitUntil: "domcontentloaded" });

    const requestBtn = page.getByRole("button", {
      name: /request signatures/i,
    });
    await expect(requestBtn).toBeVisible({ timeout: 10_000 });
    await requestBtn.click();

    // Wizard should appear — "Back to sessions" back-button is the marker.
    await expect(
      page.getByRole("button", { name: /back to sessions/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Completed tab shows empty state after switching", async ({ page }) => {
    await page.route("**/api/v1/config/app-config", (r: Route) =>
      r.fulfill({
        json: {
          enableLogin: true,
          isAdmin: false,
          languages: ["en-US"],
          defaultLocale: "en-US",
          storageGroupSigningEnabled: true,
        },
      }),
    );
    await stubSigningApis(page);

    await page.goto("/shared-sign", { waitUntil: "domcontentloaded" });

    // Mantine SegmentedControl: click the visible label, not the hidden radio input.
    const completedTab = page
      .locator("label")
      .filter({ hasText: /^completed$/i })
      .first();
    await expect(completedTab).toBeVisible({ timeout: 10_000 });
    await completedTab.click();

    await expect(page.getByText(/no completed sessions/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Viewer Share button — gating", () => {
  test("Share button absent when storageSharingEnabled is false", async ({
    page,
  }) => {
    // Default app-config has no storageSharingEnabled.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await uploadFiles(page, SAMPLE_PDF);

    // The share button should not be in the DOM.
    await expect(
      page.getByRole("button", { name: /share/i }).first(),
    ).not.toBeAttached({ timeout: 8_000 });
  });

  test("Share button present when storageSharingEnabled is true", async ({
    page,
  }) => {
    // storageSharingEnabled is a pure config flag — the WorkbenchBar renders
    // the Share button based solely on it, with no login-required check.
    await page.route("**/api/v1/config/app-config", (r: Route) =>
      r.fulfill({
        json: {
          enableLogin: false,
          isAdmin: false,
          languages: ["en-US"],
          defaultLocale: "en-US",
          storageSharingEnabled: true,
          storageEnabled: true,
        },
      }),
    );
    await page.route("**/api/v1/storage/files", (r: Route) =>
      r.fulfill({ json: [] }),
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await uploadFiles(page, SAMPLE_PDF);

    // Share button appears in the workbench toolbar once a file is open.
    await expect(
      page.getByRole("button", { name: /share/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
