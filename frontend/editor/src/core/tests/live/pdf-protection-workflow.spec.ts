import { test, expect } from "@app/tests/helpers/test-base";
import { login, skipOnboarding } from "@app/tests/helpers/login";
import type { Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const fixtures = path.join(import.meta.dirname, "../test-fixtures");
const reader = "opening-test-password";
const owner = "permissions-test-password";

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
  const config = await page.request.get("/api/v1/config/app-config");
  expect(config.ok()).toBe(true);
  if ((await config.json()).enableLogin) await login(page);
});

async function inspect(page: Page, buffer: Buffer, password: string) {
  const response = await page.request.post(
    "/api/v1/security/inspect-pdf-security",
    {
      multipart: {
        fileInput: { name: "result.pdf", mimeType: "application/pdf", buffer },
        password,
      },
    },
  );
  expect(response.ok()).toBe(true);
  return response.json();
}

test("two passwords stay distinct through protection, permissions, opening-password removal and an explicit copy", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/add-password");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(fixtures, "sample.pdf"));
  await page.getByLabel("New password to open", { exact: true }).fill(reader);
  await expect(
    page.getByRole("textbox", {
      name: "New permissions password",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByText("Restrict actions", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Prevent printing", exact: true })
    .check();
  const ownerInput = page.getByRole("textbox", {
    name: "New permissions password",
    exact: true,
  });
  await ownerInput.fill(reader);
  await expect(
    page.getByText("The two passwords must be different."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save protection", exact: true }),
  ).toBeDisabled();
  await ownerInput.fill(owner);
  const protection = page.waitForResponse(
    (response) =>
      /\/security\/(add-password|set-pdf-protection)$/.test(response.url()) &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save protection", exact: true })
    .click();
  const protectedResponse = await protection;
  expect(protectedResponse.ok()).toBe(true);
  const protectedBytes = await protectedResponse.body();
  const readerAccess = await inspect(page, protectedBytes, reader);
  expect(readerAccess).toMatchObject({
    encrypted: true,
    requiresOpeningPassword: true,
    ownerAuthenticated: false,
    canPrint: false,
  });
  expect(await inspect(page, protectedBytes, owner)).toMatchObject({
    ownerAuthenticated: true,
  });
  await expect(
    page.getByText("Protection saved", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Change Permissions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Change Permissions", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", {
      name: "Password to open the updated PDF",
      exact: true,
    })
    .fill(reader);
  await expect(
    page.getByRole("textbox", {
      name: "New permissions password",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Verified for this session", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Change permissions password", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Change Permissions", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "New permissions password", exact: true })
    .fill("unused-replacement-password");
  await page
    .getByRole("checkbox", { name: "Change permissions password", exact: true })
    .uncheck();
  await expect(
    page.getByRole("textbox", {
      name: "New permissions password",
      exact: true,
    }),
  ).toHaveCount(0);
  const changed = page.waitForResponse(
    "**/api/v1/security/change-pdf-permissions",
  );
  await page
    .getByRole("button", { name: "Change Permissions", exact: true })
    .click();
  const changedResponse = await changed;
  expect(changedResponse.ok()).toBe(true);
  expect(
    await inspect(page, await changedResponse.body(), reader),
  ).toMatchObject({
    requiresOpeningPassword: true,
    ownerAuthenticated: false,
    canPrint: false,
  });
  await expect(
    page.getByText("Protection saved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove opening password", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/remove-password$/);
  const removed = page.waitForResponse(
    "**/api/v1/security/remove-pdf-opening-password",
  );
  await page
    .getByRole("button", { name: "Remove opening password", exact: true })
    .click();
  const removedResponse = await removed;
  expect(removedResponse.ok()).toBe(true);
  const removedBytes = await removedResponse.body();
  expect(await inspect(page, removedBytes, "")).toMatchObject({
    encrypted: true,
    requiresOpeningPassword: false,
    ownerAuthenticated: false,
    canPrint: false,
  });
  expect(await inspect(page, removedBytes, owner)).toMatchObject({
    ownerAuthenticated: true,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove opening password", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Create an unprotected copy", exact: true })
    .click();
  await expect(
    page.getByText(
      "The copy will have no passwords or restrictions. The original stays protected.",
    ),
  ).toBeVisible();
  const copy = page.waitForResponse("**/api/v1/security/remove-pdf-protection");
  await page
    .getByRole("button", { name: "Create an unprotected copy", exact: true })
    .click();
  const copyResponse = await copy;
  expect(copyResponse.ok()).toBe(true);
  expect(await inspect(page, await copyResponse.body(), "")).toMatchObject({
    encrypted: false,
    requiresOpeningPassword: false,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Manage protection", exact: true }),
  ).toHaveCount(0);
});

test("a protected merge is rejected before asking for passwords or processing files", async ({
  page,
}) => {
  let operations = 0;
  page.on("request", (request) => {
    if (/\/(prepare-pdf-session|merge-pdfs)$/.test(request.url())) operations++;
  });
  await page.goto("/merge");
  const buffer = fs.readFileSync(
    path.join(fixtures, "owner-only-restricted.pdf"),
  );
  await page.getByTestId("file-input").setInputFiles([
    { name: "first.pdf", mimeType: "application/pdf", buffer },
    { name: "second.pdf", mimeType: "application/pdf", buffer },
  ]);
  await page
    .getByRole("button", { name: "Merge (2 files)", exact: true })
    .click();
  await expect(
    page
      .getByText(
        "These PDFs have separate protection settings. Process them individually.",
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(operations).toBe(0);
});

for (const action of [
  "Change Permissions",
  "Create an unprotected copy",
] as const) {
  test(`${action} requires the existing permissions password in a fresh session`, async ({
    page,
  }) => {
    const buffer = fs.readFileSync(
      path.join(fixtures, "owner-only-restricted.pdf"),
    );
    const endpoint =
      action === "Change Permissions"
        ? "change-pdf-permissions"
        : "remove-pdf-protection";
    const denied = await page.request.post(`/api/v1/security/${endpoint}`, {
      multipart: {
        fileInput: {
          name: "restricted.pdf",
          mimeType: "application/pdf",
          buffer,
        },
        password: "",
        sourcePassword: "",
      },
    });
    expect(denied.status()).toBe(403);
    let changes = 0;
    page.on("request", (request) => {
      if (request.url().endsWith(`/api/v1/security/${endpoint}`)) changes++;
    });
    await page.goto("/change-permissions");
    await page.getByTestId("file-input").setInputFiles({
      name: "restricted.pdf",
      mimeType: "application/pdf",
      buffer,
    });
    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Print PDF", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("Protected PDF", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Required to apply changes", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: "New permissions password",
        exact: true,
      }),
    ).toHaveCount(0);
    if (action === "Create an unprotected copy") {
      await page
        .getByRole("button", { name: "Manage protection", exact: true })
        .click();
      await expect(
        page.getByText("Restrictions for recipients", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: action, exact: true }).click();
    }
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(
      page.getByRole("dialog", {
        name: "Enter permissions password",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(changes).toBe(0);
    await expect(
      page.getByRole("button", { name: "Print PDF", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: action, exact: true }).click();
    await page
      .getByLabel("Permissions password", { exact: true })
      .fill("incorrect");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Incorrect password" }),
    ).toBeVisible();
    expect(changes).toBe(0);
    await page
      .getByLabel("Permissions password", { exact: true })
      .fill("owner-test-password");
    const response = page.waitForResponse(`**/api/v1/security/${endpoint}`);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const result = await response;
    expect(result.ok()).toBe(true);
    expect(changes).toBe(1);
    const output = await result.body();
    if (action === "Change Permissions") {
      expect(await inspect(page, output, "")).toMatchObject({
        encrypted: true,
        ownerAuthenticated: false,
        canPrint: false,
      });
      expect(await inspect(page, output, "owner-test-password")).toMatchObject({
        ownerAuthenticated: true,
      });
      await expect(
        page.getByText("Permissions unlocked for this session", {
          exact: true,
        }),
      ).toBeVisible();
    } else {
      expect(await inspect(page, output, "")).toMatchObject({
        encrypted: false,
      });
    }
    await expect(
      page.getByRole("button", { name: "Print PDF", exact: true }),
    ).toBeEnabled();
  });
}
