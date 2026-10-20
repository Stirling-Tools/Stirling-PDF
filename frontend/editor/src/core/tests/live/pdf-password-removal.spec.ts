import { test, expect } from "@app/tests/helpers/test-base";
import { liveApiHeaders, loadLiveAppConfig } from "@app/tests/helpers/live-api";
import type { Page, Response } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";

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
  const response = await page.request.post(
    "/api/v1/security/set-pdf-protection",
    {
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
    },
  );
  expect(response.ok()).toBe(true);
  return response.body();
}

async function inspect(page: Page, buffer: Buffer, password: string) {
  return page.request.post("/api/v1/security/inspect-pdf-security", {
    headers: await liveApiHeaders(page),
    multipart: {
      fileInput: { name: "result.pdf", mimeType: "application/pdf", buffer },
      password,
    },
  });
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
      "**/api/v1/security/remove-pdf-passwords",
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
    expect(result.ok()).toBe(true);
    expect(await result.json()).toMatchObject({
      encrypted: permissions,
      requiresOpeningPassword: false,
      hasOwnerPassword: permissions,
      canPrint: !permissions,
    });
    if (permissions) {
      expect(
        (await (await inspect(page, saved, owner)).json()).ownerAuthenticated,
      ).toBe(true);
    }
    expect(
      (await (await inspect(page, original, reader)).json())
        .requiresOpeningPassword,
    ).toBe(true);
  });
}

test("closing load-time owner verification leaves the protected source unchanged", async ({
  page,
}) => {
  const original = await protectedPdf(page, true, true);
  let removals = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/remove-pdf-passwords")) removals++;
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
  expect(
    (await (await inspect(page, original, reader)).json())
      .requiresOpeningPassword,
  ).toBe(true);
});

for (const remove of ["opening", "owner", "both"] as const) {
  test(`removing ${remove} keeps every blank password and refreshes print access`, async ({
    page,
  }) => {
    const original = await protectedPdf(page, true, true);
    const honor =
      (await (await inspect(page, original, reader)).json())
        .honorOwnerPasswords !== false;
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
      "**/api/v1/security/remove-pdf-passwords",
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
    expect(result.ok()).toBe(true);
    expect(await result.json()).toMatchObject({
      encrypted: remove !== "both",
      requiresOpeningPassword: remove === "owner",
      hasOwnerPassword: remove === "opening",
      canPrint: remove !== "opening",
    });
    if (remove === "opening") {
      expect(
        (await (await inspect(page, saved, owner)).json()).ownerAuthenticated,
      ).toBe(true);
      await expect(
        page.getByText("Opening password removed. Restrictions retained."),
      ).toBeVisible();
    } else if (remove === "owner") {
      expect((await inspect(page, saved, "")).ok()).toBe(false);
      expect((await inspect(page, saved, owner)).ok()).toBe(false);
      await expect(
        page.getByText(
          "Permissions password and restrictions removed. Opening password kept.",
        ),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText("Both passwords and restrictions removed."),
      ).toBeVisible();
    }
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
      (await (await inspect(page, original, reader)).json())
        .requiresOpeningPassword,
    ).toBe(true);
  });
}

for (const only of ["opening", "owner"] as const) {
  test(`only enables the ${only} password when that is the only password set`, async ({
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
    ).toBeEnabled({ enabled: only === "owner" });
    const label =
      only === "opening" ? "Password to open" : "Permissions password";
    await page
      .getByLabel(label, { exact: true })
      .fill(only === "opening" ? reader : owner);
    const responsePromise = page.waitForResponse(
      "**/api/v1/security/remove-pdf-passwords",
    );
    await page
      .getByRole("button", { name: /^Remove Password(?: \(this file\))?$/ })
      .click();
    const response = await responsePromise;
    expect(response.ok()).toBe(true);
    expect(
      (await (await inspect(page, await response.body(), "")).json()).encrypted,
    ).toBe(false);
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
    "**/api/v1/security/remove-pdf-passwords",
  );
  await page
    .getByRole("button", { name: /^Remove Password(?: \(this file\))?$/ })
    .click();
  expect((await responsePromise).ok()).toBe(false);
  await expect(page.getByText("Protected PDF", { exact: true })).toBeVisible();
});

for (const remove of ["opening", "owner", "both"] as const) {
  test(`mixed selections remove ${remove} passwords only where set`, async ({
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
    await expect(
      page.getByText("Set on 2 of 4 PDFs", { exact: true }),
    ).toHaveCount(2);
    const openingInput = page.getByLabel("Password to open", { exact: true });
    const ownerInput = page.getByLabel("Permissions password", { exact: true });
    await expect(openingInput).toBeEnabled();
    await expect(ownerInput).toBeEnabled();
    if (remove !== "owner") await openingInput.fill(reader);
    if (remove !== "opening") await ownerInput.fill(owner);
    const responses: Response[] = [];
    page.on("response", (response) => {
      if (response.url().endsWith("/remove-pdf-passwords"))
        responses.push(response);
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
    await expect(
      page.getByText(
        "Entered passwords removed where set. Blank fields kept unchanged.",
      ),
    ).toBeVisible();
    expect(responses).toHaveLength(remove === "both" ? 3 : 2);
    const protection = [];
    for (const response of responses) {
      expect(response.ok()).toBe(true);
      const buffer = await response.body();
      const inspection = await inspect(
        page,
        buffer,
        remove === "owner" ? reader : "",
      );
      expect(inspection.ok()).toBe(true);
      const result = await inspection.json();
      protection.push({
        encrypted: result.encrypted,
        requiresOpeningPassword: result.requiresOpeningPassword,
        hasOwnerPassword: result.hasOwnerPassword,
        canPrint: result.canPrint,
      });
      if (result.hasOwnerPassword)
        expect(
          (await (await inspect(page, buffer, owner)).json())
            .ownerAuthenticated,
        ).toBe(true);
    }
    const unprotected = {
      encrypted: false,
      requiresOpeningPassword: false,
      hasOwnerPassword: false,
      canPrint: true,
    };
    expect(protection.filter((result) => !result.encrypted)).toEqual(
      remove === "both"
        ? [unprotected, unprotected, unprotected]
        : [unprotected],
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
    if (remove !== "both")
      await expect(
        page
          .getByTestId("file-thumbnail")
          .filter({
            hasText:
              remove === "opening" ? "owner-only.pdf" : "opening-only.pdf",
          })
          .getByText("v1", { exact: true }),
      ).toBeVisible();
  });
}
