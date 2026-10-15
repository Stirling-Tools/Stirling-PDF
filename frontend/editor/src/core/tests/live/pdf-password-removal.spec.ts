import { test, expect } from "@app/tests/helpers/test-base";
import { login, skipOnboarding } from "@app/tests/helpers/login";
import type { Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs/promises";

const reader = "removal-reader";
const owner = "removal-owner";
const fixture = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
  const response = await page.request.get("/api/v1/config/app-config");
  expect(response.ok()).toBe(true);
  if ((await response.json()).enableLogin) await login(page);
});

async function protectedPdf(
  page: Page,
  opening: boolean,
  permissions: boolean,
) {
  const response = await page.request.post(
    "/api/v1/security/set-pdf-protection",
    {
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
    const dialog = page.getByRole("dialog", { name: "Open PDF", exact: true });
    await dialog.getByLabel("Password to open", { exact: true }).fill(reader);
    await dialog.getByRole("button", { name: "Open PDF", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(
    page.getByText("Leave a field blank to keep that password."),
  ).toBeVisible();
}

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
    .getByRole("button", { name: "Cancel", exact: true })
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
