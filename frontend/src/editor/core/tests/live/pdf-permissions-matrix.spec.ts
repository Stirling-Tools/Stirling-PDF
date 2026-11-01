import { inspectPdfProtection as inspect } from "@editor/tests/helpers/pdf-protection";
import { test, expect } from "@editor/tests/helpers/test-base";
import {
  liveApiHeaders,
  loadLiveAppConfig,
} from "@editor/tests/helpers/live-api";
import { skipOnboarding } from "@editor/tests/helpers/login";
import type { BrowserContext, Page } from "@playwright/test";
import { PdfPermissionFlag } from "@embedpdf/models";
import path from "node:path";

const fixtures = path.join(import.meta.dirname, "../test-fixtures");
const owner = "matrix-owner-password";
const restrictions = [
  {
    label: "Prevent assembly of document",
    bit: PdfPermissionFlag.AssembleDocument,
    endpoint: "/api/v1/general/rotate-pdf",
  },
  {
    label: "Prevent content extraction",
    bit: PdfPermissionFlag.CopyContents,
    endpoint: "/api/v1/general/split-pages",
  },
  {
    label: "Prevent extraction for accessibility",
    bit: PdfPermissionFlag.ExtractForAccessibility,
  },
  { label: "Prevent filling in form", bit: PdfPermissionFlag.FillForms },
  {
    label: "Prevent modification",
    bit: PdfPermissionFlag.ModifyContents,
    endpoint: "/api/v1/misc/compress-pdf",
  },
  {
    label: "Prevent annotation modification",
    bit: PdfPermissionFlag.ModifyAnnotations,
  },
  { label: "Prevent printing", bit: PdfPermissionFlag.Print },
  {
    label: "Prevent high-quality printing",
    bit: PdfPermissionFlag.PrintHighQuality,
  },
] as const;

test.beforeEach(async ({ page }) => {
  await loadLiveAppConfig(page);
});

async function openFresh(
  source: Page,
  buffer: Buffer,
  name: string,
  contexts: BrowserContext[],
) {
  const context = await source
    .context()
    .browser()!
    .newContext({
      baseURL: new URL(source.url()).origin,
      storageState: await source.context().storageState(),
      viewport: source.viewportSize() ?? undefined,
    });
  contexts.push(context);
  const page = await context.newPage();
  await skipOnboarding(page);
  await page.goto("/change-permissions");
  await page
    .getByTestId("file-input")
    .setInputFiles({ name, mimeType: "application/pdf", buffer });
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible();
  await expect(page.getByText("Protected PDF", { exact: true })).toBeVisible();
  return page;
}

async function assertPrintOutput(page: Page) {
  await page.getByRole("button", { name: "Print PDF", exact: true }).click();
  const frame = page.locator('iframe[title="Print Document"]');
  await expect(frame).toHaveAttribute("src", /^blob:/);
  const source = await frame.getAttribute("src");
  const bytes = await page.evaluate(
    async (url) =>
      Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())),
    source,
  );
  expect(await inspect(page, Buffer.from(bytes))).toMatchObject({
    encrypted: false,
    pageCount: 1,
  });
}

async function assertCopyAccess(page: Page, allowed: boolean) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() =>
    navigator.clipboard.writeText("protection-test-marker"),
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
  if (allowed) {
    await expect(copy).toBeEnabled();
    await copy.click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .not.toBe("protection-test-marker");
    expect(
      (await page.evaluate(() => navigator.clipboard.readText())).trim(),
    ).not.toBe("");
  } else {
    await expect(copy).toBeDisabled();
    await page.keyboard.press("Escape");
  }
}

for (const restriction of restrictions) {
  test(`${restriction.label}: setting on and off preserves protection and follows the server policy`, async ({
    page,
  }) => {
    const readerContexts: BrowserContext[] = [];
    try {
      await page.goto("/add-password");
      await page
        .getByTestId("file-input")
        .setInputFiles(path.join(fixtures, "sample.pdf"));
      await page.getByText("Restrict actions", { exact: true }).click();
      await page
        .getByRole("checkbox", { name: restriction.label, exact: true })
        .check();
      await page
        .getByRole("textbox", { name: "New permissions password", exact: true })
        .fill(owner);
      const protectedResponse = page.waitForResponse(
        "**/api/v1/security/add-password",
      );
      await page
        .getByRole("button", { name: "Save protection", exact: true })
        .click();
      const result = await protectedResponse;
      expect(result.ok()).toBe(true);
      const protectedBytes = await result.body();
      const readerAccess = await inspect(page, protectedBytes);
      const honorOwnerPasswords = readerAccess.honorOwnerPasswords !== false;
      expect(readerAccess).toMatchObject({
        encrypted: true,
        ownerAuthenticated: false,
        requiresOpeningPassword: false,
      });
      for (const other of restrictions) {
        expect((readerAccess.permissions & other.bit) !== 0, other.label).toBe(
          other.bit !== restriction.bit,
        );
      }
      expect(await inspect(page, protectedBytes, owner)).toMatchObject({
        ownerAuthenticated: true,
      });
      await expect(
        page.getByText("Protection saved", { exact: true }),
      ).toBeVisible();

      page = await openFresh(
        page,
        protectedBytes,
        `restricted-${restriction.bit}.pdf`,
        readerContexts,
      );
      await expect(
        page.getByRole("checkbox", { name: restriction.label, exact: true }),
      ).toBeChecked();
      const printButton = page.getByRole("button", {
        name: "Print PDF",
        exact: true,
      });
      if (
        honorOwnerPasswords &&
        (restriction.bit === PdfPermissionFlag.Print ||
          restriction.bit === PdfPermissionFlag.PrintHighQuality)
      ) {
        await expect(printButton).toBeDisabled();
        await printButton.locator("..").hover();
        await expect(
          page.getByText(
            restriction.bit === PdfPermissionFlag.Print
              ? "Printing is restricted. Verify permissions in Manage protection."
              : "This PDF allows low-quality printing only, which this viewer does not support.",
            { exact: true },
          ),
        ).toBeVisible();
      } else {
        await assertPrintOutput(page);
      }
      if ("endpoint" in restriction) {
        const denied = await page.request.post(
          "/api/v1/security/prepare-pdf-session",
          {
            headers: await liveApiHeaders(page),
            multipart: {
              fileInput: {
                name: "restricted.pdf",
                mimeType: "application/pdf",
                buffer: protectedBytes,
              },
              password: "",
              endpoint: restriction.endpoint,
            },
          },
        );
        expect(denied.status()).toBe(honorOwnerPasswords ? 403 : 200);
      }
      if (restriction.bit === PdfPermissionFlag.CopyContents)
        await assertCopyAccess(page, !honorOwnerPasswords);

      await page
        .getByRole("checkbox", { name: restriction.label, exact: true })
        .uncheck();
      const savedOwner = owner;
      const changedResponse = page.waitForResponse(
        "**/api/v1/security/add-password",
      );
      await page
        .getByRole("button", {
          name: /^Change Permissions(?: \(this file\))?$/,
        })
        .click();
      if (honorOwnerPasswords) {
        await expect(
          page.getByRole("dialog", {
            name: "Enter permissions password",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByLabel("Permissions password", { exact: true })
          .fill(owner);
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .click();
      } else {
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }
      const changed = await changedResponse;
      expect(changed.ok()).toBe(true);
      const allowedBytes = await changed.body();
      const allowed = await inspect(page, allowedBytes);
      expect(allowed).toMatchObject({
        encrypted: true,
        ownerAuthenticated: false,
      });
      for (const other of restrictions)
        expect((allowed.permissions & other.bit) !== 0, other.label).toBe(true);
      expect(await inspect(page, allowedBytes, savedOwner)).toMatchObject({
        ownerAuthenticated: true,
      });
      await expect(
        page.getByText("Protection saved", { exact: true }),
      ).toBeVisible();
      if ("endpoint" in restriction) {
        const permitted = await page.request.post(
          "/api/v1/security/prepare-pdf-session",
          {
            headers: await liveApiHeaders(page),
            multipart: {
              fileInput: {
                name: "allowed.pdf",
                mimeType: "application/pdf",
                buffer: allowedBytes,
              },
              password: "",
              endpoint: restriction.endpoint,
            },
          },
        );
        expect(permitted.ok()).toBe(true);
      }
      page = await openFresh(
        page,
        allowedBytes,
        `allowed-${restriction.bit}.pdf`,
        readerContexts,
      );
      await expect(
        page.getByRole("checkbox", { name: restriction.label, exact: true }),
      ).not.toBeChecked();
      await assertPrintOutput(page);
      if (restriction.bit === PdfPermissionFlag.CopyContents)
        await assertCopyAccess(page, true);
    } finally {
      for (const context of readerContexts) await context.close();
    }
  });
}
