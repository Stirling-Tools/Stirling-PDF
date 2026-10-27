import { inspectPdfProtection as inspect } from "@editor/tests/helpers/pdf-protection";
import { test, expect } from "@editor/tests/helpers/test-base";
import { loadLiveAppConfig } from "@editor/tests/helpers/live-api";
import { skipOnboarding } from "@editor/tests/helpers/login";
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
  await loadLiveAppConfig(page);
});

async function openTextEditor(page: Page) {
  await page
    .getByRole("link", { name: "PDF Text Editor", exact: true })
    .first()
    .click();
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible();
}

for (const entry of ["workbench", "editor upload"] as const) {
  test(`a fresh reader follows the owner policy through ${entry}`, async ({
    page,
  }) => {
    const access = await inspect(page, await fs.readFile(restricted), "");
    expect(access).toMatchObject({
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
    if (access.honorOwnerPasswords !== false) {
      await expect(
        page.getByText(deniedMessage, { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
      await expect(
        page.locator('[data-testid^="pdf-editor-run-"]'),
      ).toHaveCount(0);
      const verify = page.getByRole("button", {
        name: "Enter permissions password",
        exact: true,
      });
      await verify.click();
      const dialog = page.getByRole("dialog", {
        name: "Enter permissions password",
        exact: true,
      });
      await expect(
        dialog.getByLabel("Permissions password", { exact: true }),
      ).toBeVisible();
      await expect(
        dialog.getByLabel("Password to open", { exact: true }),
      ).toHaveCount(0);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
      await verify.click();
      await dialog
        .getByLabel("Permissions password", { exact: true })
        .fill("incorrect-password");
      await dialog
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await expect(
        dialog.getByText("Incorrect password", { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("pdf-editor-page-0")).toHaveCount(0);
      await dialog
        .getByLabel("Permissions password", { exact: true })
        .fill(owner);
      await dialog
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await expect(dialog).toBeHidden();
      await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible();
      await expect(page.getByTestId("pdf-editor-error")).toHaveCount(0);
    } else {
      await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible();
      await expect(
        page
          .locator('[data-testid^="pdf-editor-run-"][contenteditable="true"]')
          .first(),
      ).toBeVisible();
      await expect(page.getByText(deniedMessage, { exact: true })).toHaveCount(
        0,
      );
      await expect(
        page.getByRole("button", {
          name: "Enter permissions password",
          exact: true,
        }),
      ).toHaveCount(0);
    }
  });
}

test("permitted text edits preserve protection and a fresh reader follows the server policy", async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const source = await fs.readFile(restricted);
  const sourceAccess = await inspect(page, source, owner);
  const honorOwnerPasswords = sourceAccess.honorOwnerPasswords !== false;
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
  if (honorOwnerPasswords) {
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
  } else {
    await expect(
      page.getByRole("button", {
        name: "Verify permissions for this session",
        exact: true,
      }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("button", {
      name: honorOwnerPasswords
        ? "Editing unlocked for this session"
        : "Editing restriction ignored",
      exact: true,
    })
    .hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    honorOwnerPasswords
      ? "Unlocked for this session using your permissions password."
      : "Permissions are ignored by this server's settings. The PDF's protection is unchanged.",
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
    encryptionRevision: sourceAccess.encryptionRevision,
    credentialEntries: sourceAccess.credentialEntries,
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
    if (honorOwnerPasswords) {
      await expect(
        readerPage.getByText(deniedMessage, { exact: true }),
      ).toBeVisible();
      await expect(readerPage.getByTestId("pdf-editor-page-0")).toHaveCount(0);
    } else {
      await expect(readerPage.getByTestId("pdf-editor-page-0")).toBeVisible();
      await expect(
        readerPage.getByText(deniedMessage, { exact: true }),
      ).toHaveCount(0);
    }
  } finally {
    await readerContext.close();
  }
});
