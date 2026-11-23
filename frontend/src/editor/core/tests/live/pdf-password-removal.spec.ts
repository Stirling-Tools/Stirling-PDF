import { inspectPdfProtection } from "@editor/tests/helpers/pdf-protection";
import { test, expect } from "@editor/tests/helpers/test-base";
import {
  liveApiHeaders,
  loadLiveAppConfig,
} from "@editor/tests/helpers/live-api";
import type { Page, Response } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";

async function inspect(page: Page, buffer: Buffer, password: string) {
  const access = await inspectPdfProtection(page, buffer, password);
  const hasOwnerPassword =
    access.encrypted &&
    (await inspectPdfProtection(page, buffer, owner).then(
      (result) => result.ownerAuthenticated,
      () => false,
    ));
  return { ...access, hasOwnerPassword };
}

const reader = "removal-reader";
const owner = "removal-owner";
const fixture = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

test.beforeEach(async ({ page }) => {
  await loadLiveAppConfig(page);
});

async function protectedPdf(
  page: Page,
  opening: boolean,
  permissions: boolean,
) {
  const response = await page.request.post("/api/v1/security/add-password", {
    headers: await liveApiHeaders(page),
    multipart: {
      fileInput: {
        name: "sample.pdf",
        mimeType: "application/pdf",
        buffer: await fs.readFile(fixture),
      },
      password: opening ? reader : "",
      ownerPassword: permissions ? owner : "",
      keyLength: 256,
      preventPrinting: permissions,
      preventModify: permissions,
    },
  });
  expect(response.ok()).toBe(true);
  return response.body();
}

async function upload(page: Page, buffer: Buffer, opening = true) {
  await page.goto("/remove-password");
  await page.getByTestId("file-input").setInputFiles({
    name: "removal-test.pdf",
    mimeType: "application/pdf",
    buffer,
  });
  if (opening) {
    const dialog = page.getByRole("dialog", { name: /^Open PDF/ });
    await dialog.getByLabel("Password to open", { exact: true }).fill(reader);
    await dialog.getByRole("button", { name: "Open PDF", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Open PDF/ })).toBeHidden();
  await expect(
    page.getByText("Leave a field blank to keep that password."),
  ).toBeVisible();
}

for (const permissions of [false, true]) {
  test(`load-time removal keeps separate owner protection: ${permissions}`, async ({
    page,
  }) => {
    const original = await protectedPdf(page, true, permissions);
    await page.goto("/editor");
    await page.getByTestId("file-input").setInputFiles({
      name: "load-time.pdf",
      mimeType: "application/pdf",
      buffer: original,
    });
    const dialog = page.getByRole("dialog");
    const remove = dialog.getByRole("button", {
      name: "Remove Password",
      exact: true,
    });
    const open = dialog.getByRole("button", { name: "Open PDF", exact: true });
    await expect(remove).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Close", exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const [removeBounds, openBounds] = await Promise.all([
          remove.boundingBox(),
          open.boundingBox(),
        ]);
        return Math.abs(removeBounds!.y - openBounds!.y);
      })
      .toBeLessThan(1);
    await dialog
      .getByLabel("Password to open", { exact: true })
      .fill("wrong-password");
    await remove.click();
    await expect(dialog.getByRole("alert")).toContainText("Incorrect password");
    await dialog.getByLabel("Password to open", { exact: true }).fill(reader);
    const removalResponse = page.waitForResponse(
      "**/api/v1/security/remove-password",
    );
    await remove.click();
    if (permissions) {
      await expect(
        dialog.getByRole("heading", {
          name: "Enter permissions password",
          exact: true,
        }),
      ).toBeVisible();
      await expect(dialog.getByText(/This will not remove it/)).toBeVisible();
      await expect(
        dialog.getByLabel("Permissions password", { exact: true }),
      ).toHaveValue("");
      await dialog
        .getByLabel("Permissions password", { exact: true })
        .fill(reader);
      await dialog
        .getByRole("button", { name: "Continue", exact: true })
        .click();
      await expect(dialog.getByRole("alert")).toContainText(
        "Enter the permissions password",
      );
      await dialog
        .getByLabel("Permissions password", { exact: true })
        .fill(owner);
      await dialog
        .getByRole("button", { name: "Continue", exact: true })
        .click();
    }
    const response = await removalResponse;
    expect(response.ok()).toBe(true);
    const saved = await response.body();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText("load-time_password_removed.pdf", { exact: true }).first(),
    ).toBeVisible();
    const result = await inspect(page, saved, "");
    expect(result).toMatchObject({
      encrypted: permissions,
      requiresOpeningPassword: false,
      hasOwnerPassword: permissions,
      canPrint: !permissions,
    });
    if (permissions) {
      expect((await inspect(page, saved, owner)).ownerAuthenticated).toBe(true);
    }
    expect(
      (await inspect(page, original, reader)).requiresOpeningPassword,
    ).toBe(true);
  });
}

test("closing load-time owner verification leaves the protected source unchanged", async ({
  page,
}) => {
  const original = await protectedPdf(page, true, true);
  let removals = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/remove-password")) removals++;
  });
  await page.goto("/editor");
  await page.getByTestId("file-input").setInputFiles({
    name: "cancel-removal.pdf",
    mimeType: "application/pdf",
    buffer: original,
  });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Password to open", { exact: true }).fill(reader);
  await dialog
    .getByRole("button", { name: "Remove Password", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Permissions password", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(removals).toBe(0);
  await expect(page.locator('[data-page-index="0"]')).toHaveCount(0);
  expect((await inspect(page, original, reader)).requiresOpeningPassword).toBe(
    true,
  );
});

for (const remove of ["opening", "owner", "both"] as const) {
  test(`removing ${remove} keeps every blank password and refreshes print access`, async ({
    page,
  }) => {
    const original = await protectedPdf(page, true, true);
    const honor =
      (await inspect(page, original, reader)).honorOwnerPasswords !== false;
    await upload(page, original);
    const submit = page.getByRole("button", {
      name: /^Remove Password(?: \(this file\))?$/,
    });
    await expect(submit).toBeDisabled();
    await expect(
      page.getByLabel("Password to open", { exact: true }),
    ).toHaveValue("");
    await expect(
      page.getByLabel("Permissions password", { exact: true }),
    ).toHaveValue("");
    if (remove !== "owner")
      await page.getByLabel("Password to open", { exact: true }).fill(reader);
    if (remove !== "opening")
      await page
        .getByLabel("Permissions password", { exact: true })
        .fill(owner);
    const responsePromise = page.waitForResponse(
      "**/api/v1/security/remove-password",
    );
    await submit.click();
    if (remove === "opening") {
      const verification = page.getByRole("dialog", {
        name: "Enter permissions password",
        exact: true,
      });
      await expect(
        verification.getByText(/This will not remove it/),
      ).toBeVisible();
      await verification
        .getByLabel("Permissions password", { exact: true })
        .fill(owner);
      await verification
        .getByRole("button", { name: "Continue", exact: true })
        .click();
    }
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    const saved = await response.body();
    const password = remove === "owner" ? reader : "";
    const result = await inspect(page, saved, password);
    expect(result).toMatchObject({
      encrypted: remove !== "both",
      requiresOpeningPassword: remove === "owner",
      hasOwnerPassword: remove === "opening",
      canPrint: remove !== "opening",
    });
    if (remove === "opening") {
      expect((await inspect(page, saved, owner)).ownerAuthenticated).toBe(true);
    } else if (remove === "owner") {
      await expect(inspect(page, saved, "")).rejects.toThrow("PDF open failed");
      await expect(inspect(page, saved, owner)).rejects.toThrow(
        "PDF open failed",
      );
    }
    await expect(page.getByTestId("download-result-button")).toBeEnabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Print PDF", exact: true }),
    ).toBeEnabled({ enabled: remove !== "opening" || !honor });
    if (remove !== "opening") {
      await page
        .getByRole("button", { name: "Print PDF", exact: true })
        .click();
      await expect(
        page.locator('iframe[title="Print Document"]'),
      ).toHaveAttribute("src", /^blob:/);
    }
    expect(
      (await inspect(page, original, reader)).requiresOpeningPassword,
    ).toBe(true);
  });
}

for (const only of ["opening", "owner"] as const) {
  test(`removes the ${only} password while leaving unknown roles selectable`, async ({
    page,
  }) => {
    const original = await protectedPdf(
      page,
      only === "opening",
      only === "owner",
    );
    await upload(page, original, only === "opening");
    await expect(
      page.getByLabel("Password to open", { exact: true }),
    ).toBeEnabled({ enabled: only === "opening" });
    await expect(
      page.getByLabel("Permissions password", { exact: true }),
    ).toBeEnabled();
    const label =
      only === "opening" ? "Password to open" : "Permissions password";
    await page
      .getByLabel(label, { exact: true })
      .fill(only === "opening" ? reader : owner);
    const responsePromise = page.waitForResponse(
      "**/api/v1/security/remove-password",
    );
    await page
      .getByRole("button", { name: /^Remove Password(?: \(this file\))?$/ })
      .click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    expect((await inspect(page, await response.body(), "")).encrypted).toBe(
      false,
    );
    await expect(
      page.getByRole("button", { name: "Print PDF", exact: true }),
    ).toBeEnabled();
  });
}

test("wrong role credentials cannot remove protection and cancelled verification leaves both fields unchanged", async ({
  page,
}) => {
  await upload(page, await protectedPdf(page, true, true));
  await page.getByLabel("Password to open", { exact: true }).fill(reader);
  await page
    .getByRole("button", { name: /^Remove Password(?: \(this file\))?$/ })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByLabel("Password to open", { exact: true }),
  ).toHaveValue(reader);
  await expect(
    page.getByLabel("Permissions password", { exact: true }),
  ).toHaveValue("");
  await page.getByLabel("Permissions password", { exact: true }).fill(reader);
  const responsePromise = page.waitForResponse(
    "**/api/v1/security/remove-password",
  );
  await page
    .getByRole("button", { name: /^Remove Password(?: \(this file\))?$/ })
    .click();
  expect((await responsePromise).ok()).toBe(false);
  await expect(page.getByText("Protected PDF", { exact: true })).toBeVisible();
});

for (const remove of ["opening", "owner", "both"] as const) {
  test(`mixed selections validate unknown ${remove} roles during processing`, async ({
    page,
  }) => {
    const inputs = [
      {
        name: "opening-only.pdf",
        buffer: await protectedPdf(page, true, false),
      },
      { name: "owner-only.pdf", buffer: await protectedPdf(page, false, true) },
      {
        name: "both-passwords.pdf",
        buffer: await protectedPdf(page, true, true),
      },
      { name: "plain.pdf", buffer: await fs.readFile(fixture) },
    ];
    await page.goto("/remove-password");
    await page
      .getByTestId("file-input")
      .setInputFiles(
        inputs.map((file) => ({ ...file, mimeType: "application/pdf" })),
      );
    const openingDialog = page.getByRole("dialog", { name: /^Open PDF/ });
    await openingDialog
      .getByLabel("Password to open", { exact: true })
      .fill(reader);
    await openingDialog.getByRole("button", { name: /Use for all/ }).click();
    await expect(openingDialog).toBeHidden();
    await page
      .locator("label")
      .filter({ hasText: /^Active Files$/ })
      .click();
    // Opening these fixtures makes absent protection known without inspecting unopened files.
    for (const name of ["plain.pdf", "owner-only.pdf"]) {
      await page
        .getByTestId("file-thumbnail")
        .filter({ hasText: name })
        .dblclick();
      await expect(
        page.getByLabel("Password to open", { exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByLabel("Permissions password", { exact: true }),
      ).toBeEnabled({ enabled: name === "owner-only.pdf" });
      await page
        .locator("label")
        .filter({ hasText: /^Active Files$/ })
        .click();
    }
    await expect(
      page.getByText("Set on 2 of 4 PDFs", { exact: true }),
    ).toHaveCount(1);
    const openingInput = page.getByLabel("Password to open", { exact: true });
    const ownerInput = page.getByLabel("Permissions password", { exact: true });
    await expect(openingInput).toBeEnabled();
    await expect(ownerInput).toBeEnabled();
    if (remove !== "owner") await openingInput.fill(reader);
    if (remove !== "opening") await ownerInput.fill(owner);
    const responses: Response[] = [];
    page.on("response", (response) => {
      if (response.url().endsWith("/remove-password")) responses.push(response);
    });
    await page.getByRole("button", { name: /^Remove Password/ }).click();
    if (remove === "opening") {
      const verification = page.getByRole("dialog", {
        name: "Enter permissions password",
        exact: true,
      });
      await expect(
        verification.getByText("both-passwords.pdf", { exact: true }),
      ).toBeVisible();
      await verification
        .getByLabel("Permissions password", { exact: true })
        .fill(owner);
      await verification
        .getByRole("button", { name: "Continue", exact: true })
        .click();
    }
    await expect(page.getByTestId("download-result-button")).toBeEnabled();
    // Owner-only removal rejects ambiguous opening credentials before sending a request.
    expect(responses).toHaveLength(remove === "both" ? 3 : 2);
    expect(responses.filter((response) => !response.ok())).toHaveLength(
      remove === "both" ? 1 : 0,
    );
    const protection = [];
    for (const response of responses) {
      if (!response.ok()) continue;
      const buffer = await response.body();
      const result = await inspect(
        page,
        buffer,
        remove === "owner" ? reader : "",
      );
      protection.push({
        encrypted: result.encrypted,
        requiresOpeningPassword: result.requiresOpeningPassword,
        hasOwnerPassword: result.hasOwnerPassword,
        canPrint: result.canPrint,
      });
      if (result.hasOwnerPassword)
        expect((await inspect(page, buffer, owner)).ownerAuthenticated).toBe(
          true,
        );
    }
    const unprotected = {
      encrypted: false,
      requiresOpeningPassword: false,
      hasOwnerPassword: false,
      canPrint: true,
    };
    expect(protection.filter((result) => !result.encrypted)).toEqual(
      remove === "both" ? [unprotected, unprotected] : [unprotected],
    );
    if (remove !== "both")
      expect(protection.filter((result) => result.encrypted)).toEqual([
        {
          encrypted: true,
          requiresOpeningPassword: remove === "owner",
          hasOwnerPassword: remove === "opening",
          canPrint: remove === "owner",
        },
      ]);
    await expect(
      page
        .getByTestId("file-thumbnail")
        .filter({ hasText: "plain.pdf" })
        .getByText("v1", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("file-thumbnail")
        .filter({
          hasText: remove === "opening" ? "owner-only.pdf" : "opening-only.pdf",
        })
        .getByText("v1", { exact: true }),
    ).toBeVisible();
    if (remove !== "opening")
      await expect(
        page
          .getByTestId("file-thumbnail")
          .filter({ hasText: "opening-only.pdf" })
          .getByText("Error", { exact: true }),
      ).toBeVisible();
  });
}
