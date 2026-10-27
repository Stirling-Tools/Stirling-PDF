import { inspectPdfProtection as inspect } from "@editor/tests/helpers/pdf-protection";
import { test, expect } from "@editor/tests/helpers/test-base";
import {
  liveApiHeaders,
  loadLiveAppConfig,
} from "@editor/tests/helpers/live-api";
import type { Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";

const fixtures = path.join(import.meta.dirname, "../test-fixtures");
const reader = "session-opening-password";
const owner = "session-permissions-password";

test.beforeEach(async ({ page }) => {
  await loadLiveAppConfig(page);
});

async function protect(page: Page) {
  const response = await page.request.post("/api/v1/security/add-password", {
    headers: await liveApiHeaders(page),
    multipart: {
      fileInput: {
        name: "sample.pdf",
        mimeType: "application/pdf",
        buffer: await fs.readFile(path.join(fixtures, "sample.pdf")),
      },
      password: reader,
      ownerPassword: owner,
      keyLength: 256,
      preventPrinting: true,
      preventAssembly: true,
      preventModify: true,
      preventExtractContent: true,
    },
  });
  expect(response.ok()).toBe(true);
  return response.body();
}

async function open(page: Page, password: string) {
  const dialog = page.getByRole("dialog", { name: /^Open PDF/ });
  await dialog.getByLabel("Password to open", { exact: true }).fill(password);
  await dialog.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible();
}

test("opening passwords reject empty and wrong input, cancel safely, and are requested again after reload", async ({
  page,
}) => {
  const buffer = await protect(page);
  await page.goto("/editor");
  const upload = {
    name: "session-protected.pdf",
    mimeType: "application/pdf",
    buffer,
  };
  await page.getByTestId("file-input").setInputFiles(upload);
  const dialog = page.getByRole("dialog", { name: /^Open PDF/ });
  await expect(
    dialog.getByRole("button", { name: "Open PDF", exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("Password to open", { exact: true }).fill("wrong");
  await dialog.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Incorrect password");
  await expect(page.locator('[data-page-index="0"]')).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByTestId("file-input").setInputFiles(upload);
  await open(page, reader);
  await page.reload();
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-page-index="0"]')).toHaveCount(0);
  await open(page, reader);
});

test("restricted processing preserves both passwords and prompts only when enforcement requires it", async ({
  page,
}) => {
  const buffer = await protect(page);
  const access = await inspect(page, buffer, reader);
  const honorOwnerPasswords = access.honorOwnerPasswords !== false;
  let preparations = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/prepare-pdf-session")) preparations++;
  });
  await page.goto("/rotate");
  await page.getByTestId("file-input").setInputFiles({
    name: "rotate-protected.pdf",
    mimeType: "application/pdf",
    buffer,
  });
  await open(page, reader);
  const apply = page.getByRole("button", {
    name: /^Apply Rotation(?: \(this file\))?$/,
  });
  if (honorOwnerPasswords) {
    await apply.click();
    const dialog = page.getByRole("dialog", {
      name: "Enter permissions password",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    expect(preparations).toBe(0);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(apply).toBeEnabled();
    await apply.click();
    await dialog
      .getByLabel("Permissions password", { exact: true })
      .fill(reader);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    expect(preparations).toBe(0);
    await dialog
      .getByLabel("Permissions password", { exact: true })
      .fill(owner);
  }
  const response = page.waitForResponse(
    "**/api/v1/security/restore-pdf-protection",
  );
  if (honorOwnerPasswords)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  else await apply.click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const saved = await result.body();
  expect(await inspect(page, saved, reader)).toMatchObject({
    ownerAuthenticated: false,
    requiresOpeningPassword: true,
    permissions: access.permissions,
    credentialEntries: access.credentialEntries,
  });
  expect(await inspect(page, saved, owner)).toMatchObject({
    ownerAuthenticated: true,
  });
  await expect(
    page.getByText("Protection retained", { exact: true }),
  ).toBeVisible();
  expect(preparations).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("removing all protection can be cancelled, then opening-only protection can be reapplied", async ({
  page,
}) => {
  const buffer = await protect(page);
  const access = await inspect(page, buffer, reader);
  let removals = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/remove-password")) removals++;
  });
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles({
    name: "protected.pdf",
    mimeType: "application/pdf",
    buffer,
  });
  await open(page, reader);
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create an unprotected copy", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  expect(removals).toBe(0);
  await expect(
    page.getByRole("button", { name: "Manage protection", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Create an unprotected copy", exact: true })
    .click();
  const response = page.waitForResponse("**/api/v1/security/remove-password");
  await page
    .getByRole("button", { name: "Create an unprotected copy", exact: true })
    .click();
  if (access.honorOwnerPasswords !== false) {
    await page.getByLabel("Permissions password", { exact: true }).fill(owner);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }
  const result = await response;
  expect(result.ok()).toBe(true);
  const unprotected = await result.body();
  expect(await inspect(page, unprotected, "")).toMatchObject({
    encrypted: false,
    requiresOpeningPassword: false,
  });
  await expect(
    page.getByRole("button", { name: "Manage protection", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Print PDF", exact: true }).click();
  await expect(page.locator('iframe[title="Print Document"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );

  await page.goto("/add-password");
  await page.getByTestId("file-input").setInputFiles({
    name: "opening-only.pdf",
    mimeType: "application/pdf",
    buffer: unprotected,
  });
  await page.getByLabel("Password to open", { exact: true }).fill(reader);
  const protection = page.waitForResponse("**/api/v1/security/add-password");
  await page
    .getByRole("button", { name: /^Save protection(?: \(this file\))?$/ })
    .click();
  const protectedResponse = await protection;
  expect(protectedResponse.ok()).toBe(true);
  expect(
    await inspect(page, await protectedResponse.body(), reader),
  ).toMatchObject({
    requiresOpeningPassword: true,
    permissions: -4,
    canPrint: true,
    canModify: true,
    canExtract: true,
  });
});

test("batch opening accepts a shared opening password without granting owner access", async ({
  page,
}) => {
  const buffer = await protect(page);
  const access = await inspect(page, buffer, reader);
  await page.goto("/rotate");
  await page.getByTestId("file-input").setInputFiles([
    { name: "batch-a.pdf", mimeType: "application/pdf", buffer },
    { name: "batch-b.pdf", mimeType: "application/pdf", buffer },
  ]);
  const dialog = page.getByRole("dialog", { name: /^Open PDF/ });
  await dialog.getByLabel("Password to open", { exact: true }).fill(reader);
  await dialog
    .getByRole("button", { name: "Use for all (2)", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Apply Rotation (2 files)", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Reader", exact: true }).click();
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible();
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Printing unlocked for this session",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Verify permissions for this session",
      exact: true,
    }),
  ).toHaveCount(access.honorOwnerPasswords === false ? 0 : 1);
  await page
    .getByRole("button", { name: "Change Permissions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Print PDF", exact: true }),
  ).toBeEnabled({ enabled: access.honorOwnerPasswords === false });
});
