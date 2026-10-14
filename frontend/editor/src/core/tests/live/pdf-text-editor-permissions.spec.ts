import { test, expect } from "@app/tests/helpers/test-base";
import { login, skipOnboarding } from "@app/tests/helpers/login";
import type { Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";

const restricted = path.join(
  import.meta.dirname,
  "../test-fixtures/owner-only-restricted.pdf",
);
const owner = "owner-test-password";
const deniedMessage = "This action requires the permissions password.";

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
  const config = await page.request.get("/api/v1/config/app-config");
  expect(config.ok()).toBe(true);
  if ((await config.json()).enableLogin) await login(page);
});

async function openTextEditor(page: Page) {
  await page
    .getByRole("link", { name: "PDF Text Editor", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible();
}

async function inspect(page: Page, buffer: Buffer, password: string) {
  const response = await page.request.post(
    "/api/v1/security/inspect-pdf-security",
    {
      multipart: {
        fileInput: {
          name: "restricted.pdf",
          mimeType: "application/pdf",
          buffer,
        },
        password,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return response.json();
}

for (const entry of ["workbench", "editor upload"] as const) {
  test(`a fresh reader cannot edit an owner-restricted PDF through ${entry}`, async ({
    page,
  }) => {
    expect(
      await inspect(page, await fs.readFile(restricted), ""),
    ).toMatchObject({
      encrypted: true,
      ownerAuthenticated: false,
      canModify: false,
    });
    if (entry === "workbench") {
      await page.goto("/editor");
      await page.getByTestId("file-input").setInputFiles(restricted);
      await expect(
        page.getByText("Protected PDF", { exact: true }),
      ).toBeVisible();
      await openTextEditor(page);
    } else {
      await page.goto("/pdf-text-editor");
      await page.getByTestId("pdf-editor-file-input").setInputFiles(restricted);
    }
    await expect(page.getByText(deniedMessage, { exact: true })).toBeVisible();
    await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
    await expect(page.locator('[data-testid^="pdf-editor-run-"]')).toHaveCount(
      0,
    );
  });
}

test("an owner can edit while the saved PDF remains restricted in a fresh reader session", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const source = await fs.readFile(restricted);
  const sourceAccess = await inspect(page, source, owner);
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles(restricted);
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Editing unlocked for this session",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Verify permissions for this session",
      exact: true,
    })
    .click();
  await page.getByLabel("Permissions password", { exact: true }).fill(owner);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Permissions unlocked for this session", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Editing unlocked for this session",
      exact: true,
    })
    .hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Unlocked for this session using your permissions password.",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await openTextEditor(page);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible();
  const run = page
    .locator('[data-testid^="pdf-editor-run-"][contenteditable="true"]')
    .first();
  await run.fill("Owner-authorized text edit");
  await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeVisible();
  await page.getByTestId("pdf-editor-download").click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-save-risk-confirm").click();
  const download = await downloadPromise;
  const savedPath = test.info().outputPath("restricted-edited.pdf");
  await download.saveAs(savedPath);
  await expect(page.getByTestId("pdf-editor-dirty-dot")).toBeHidden();
  const saved = await fs.readFile(savedPath);
  expect(await inspect(page, saved, "")).toMatchObject({
    encrypted: true,
    ownerAuthenticated: false,
    canModify: false,
    permissions: sourceAccess.permissions,
    encryptionKeyLength: sourceAccess.encryptionKeyLength,
    encryptionRevision: sourceAccess.encryptionRevision,
    credentialFingerprint: sourceAccess.credentialFingerprint,
  });
  expect(await inspect(page, saved, owner)).toMatchObject({
    ownerAuthenticated: true,
  });

  const readerContext = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: await page.context().storageState(),
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const readerPage = await readerContext.newPage();
    await skipOnboarding(readerPage);
    await readerPage.goto("/pdf-text-editor");
    await readerPage
      .getByTestId("pdf-editor-file-input")
      .setInputFiles(savedPath);
    await expect(
      readerPage.getByText(deniedMessage, { exact: true }),
    ).toBeVisible();
    await expect(readerPage.getByTestId("pdf-editor-page-0")).toHaveCount(0);
  } finally {
    await readerContext.close();
  }
});
