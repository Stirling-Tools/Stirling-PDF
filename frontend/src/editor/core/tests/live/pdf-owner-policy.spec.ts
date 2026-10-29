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
const owner = "policy-original-owner";
const replacement = "policy-replacement-owner";
const opening = "policy-opening-password";

test.beforeEach(async ({ page }) => {
  const config = await loadLiveAppConfig(page);
  test.skip(
    config.honorOwnerPasswords !== false,
    "Run against a server with SECURITY_HONOROWNERPASSWORDS=false",
  );
});

async function protect(page: Page, password = "") {
  const response = await page.request.post("/api/v1/security/add-password", {
    headers: await liveApiHeaders(page),
    multipart: {
      fileInput: {
        name: "sample.pdf",
        mimeType: "application/pdf",
        buffer: await fs.readFile(path.join(fixtures, "sample.pdf")),
      },
      password,
      ownerPassword: owner,
      keyLength: 256,
      preventAssembly: true,
      preventExtractContent: true,
      preventExtractForAccessibility: true,
      preventFillInForm: true,
      preventModify: true,
      preventModifyAnnotations: true,
      preventPrinting: true,
      preventPrintingFaithful: true,
    },
  });
  expect(response.ok()).toBe(true);
  return response.body();
}

async function upload(page: Page, buffer: Buffer, route = "/editor") {
  await page.goto(route);
  await page.getByTestId("file-input").setInputFiles({
    name: "restricted.pdf",
    mimeType: "application/pdf",
    buffer,
  });
}

test("ignored restrictions allow actual printing and copying without claiming owner verification", async ({
  page,
}) => {
  const original = await protect(page);
  expect(await inspect(page, original)).toMatchObject({
    honorOwnerPasswords: false,
    ownerAuthenticated: false,
    canPrint: false,
    canModify: false,
    canExtract: false,
  });
  await upload(page, original);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible();
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Verify permissions for this session",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Printing restriction ignored", exact: true })
    .hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Permissions are ignored by this server's settings. The PDF's protection is unchanged.",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "Print PDF", exact: true }).click();
  const printFrame = page.locator('iframe[title="Print Document"]');
  await expect(printFrame).toHaveAttribute("src", /^blob:/);
  const printUrl = await printFrame.getAttribute("src");
  const printBytes = await page.evaluate(
    async (url) =>
      Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
    printUrl,
  );
  expect(await inspect(page, Buffer.from(printBytes))).toMatchObject({
    encrypted: false,
    pageCount: 1,
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() =>
    navigator.clipboard.writeText("policy-test-marker"),
  );
  const pdfPage = page.locator('[data-page-index="0"]').first();
  const copy = page.getByRole("button", { name: "Copy", exact: true });
  await expect(async () => {
    const bounds = await pdfPage.boundingBox();
    expect(bounds).not.toBeNull();
    await pdfPage.click({
      button: "right",
      position: { x: bounds!.width * 0.21, y: bounds!.height * 0.105 },
    });
    await expect(copy).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .not.toBe("policy-test-marker");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).trim(),
  ).not.toBe("");
});

test("unprotected copy needs no owner password when enforcement is disabled", async ({
  page,
}) => {
  await upload(page, await protect(page));
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
  const result = await response;
  expect(result.ok()).toBe(true);
  expect(await inspect(page, await result.body())).toMatchObject({
    encrypted: false,
  });
  await expect(
    page.getByRole("dialog", {
      name: "Enter permissions password",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Print PDF", exact: true }),
  ).toBeEnabled();
});

test("restricted rotation preserves the original protection without owner authentication", async ({
  page,
}) => {
  const original = await protect(page);
  const originalAccess = await inspect(page, original);
  await upload(page, original, "/rotate");
  const response = page.waitForResponse(
    "**/api/v1/security/restore-pdf-protection",
  );
  await page
    .getByRole("button", { name: /^Apply Rotation(?: \(this file\))?$/ })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const saved = await result.body();
  expect(await inspect(page, saved)).toMatchObject({
    encrypted: true,
    ownerAuthenticated: false,
    permissions: originalAccess.permissions,
    credentialEntries: originalAccess.credentialEntries,
  });
  expect(await inspect(page, saved, owner)).toMatchObject({
    ownerAuthenticated: true,
  });
  await expect(
    page.getByText("Protection retained", { exact: true }),
  ).toBeVisible();
});

test("changing restrictions preserves the unknown owner password unless replacement is selected", async ({
  page,
}) => {
  await upload(page, await protect(page), "/change-permissions");
  await page
    .getByRole("checkbox", { name: "Change permissions password", exact: true })
    .check();
  await page
    .getByRole("textbox", { name: "New permissions password", exact: true })
    .fill(replacement);
  await page
    .getByRole("checkbox", { name: "Prevent printing", exact: true })
    .uncheck();
  const response = page.waitForResponse("**/api/v1/security/add-password");
  await page
    .getByRole("button", { name: /^Change Permissions(?: \(this file\))?$/ })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const saved = await result.body();
  expect(await inspect(page, saved)).toMatchObject({
    canPrint: true,
    ownerAuthenticated: false,
  });
  expect(await inspect(page, saved, replacement)).toMatchObject({
    ownerAuthenticated: true,
  });
});

test("removing an opening password retains the blank owner field even when enforcement is off", async ({
  page,
}) => {
  const original = await protect(page, opening);
  await upload(page, original, "/remove-password");
  const dialog = page.getByRole("dialog", { name: /^Open PDF/ });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Password to open", { exact: true }).fill("wrong");
  await dialog.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(
    dialog.getByText("Incorrect password", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Password to open", { exact: true }).fill(opening);
  await dialog.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByLabel("Password to open", { exact: true }).fill(opening);
  const response = page.waitForResponse("**/api/v1/security/remove-password");
  await page
    .getByRole("button", {
      name: /^Remove Password(?: \(this file\))?$/,
    })
    .click();
  const verification = page.getByRole("dialog", {
    name: "Enter permissions password",
    exact: true,
  });
  await expect(verification.getByText(/This will not remove it/)).toBeVisible();
  await verification
    .getByLabel("Permissions password", { exact: true })
    .fill(owner);
  await verification
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  const saved = await result.body();
  expect(await inspect(page, saved)).toMatchObject({
    encrypted: true,
    requiresOpeningPassword: false,
    canPrint: false,
    ownerAuthenticated: false,
  });
  expect(await inspect(page, saved, owner)).toMatchObject({
    ownerAuthenticated: true,
  });
});

test("text editing bypass retains encryption and the original credentials in the saved PDF", async ({
  page,
}) => {
  const original = await fs.readFile(
    path.join(fixtures, "owner-only-restricted.pdf"),
  );
  const originalAccess = await inspect(page, original);
  await page.goto("/pdf-text-editor");
  await page.getByTestId("pdf-editor-file-input").setInputFiles({
    name: "restricted.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible();
  await page
    .locator('[data-testid^="pdf-editor-run-"][contenteditable="true"]')
    .first()
    .fill("Editing with owner restrictions ignored");
  await page.getByTestId("pdf-editor-download").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-save-risk-confirm").click();
  const download = await downloadPromise;
  const savedPath = test.info().outputPath("edited.pdf");
  await download.saveAs(savedPath);
  const saved = await fs.readFile(savedPath);
  expect(await inspect(page, saved)).toMatchObject({
    encrypted: true,
    ownerAuthenticated: false,
    canModify: false,
    permissions: originalAccess.permissions,
    credentialEntries: originalAccess.credentialEntries,
  });
  expect(await inspect(page, saved, "owner-test-password")).toMatchObject({
    ownerAuthenticated: true,
  });
});
