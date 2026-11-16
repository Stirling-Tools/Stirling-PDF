import { inspectPdfProtection as inspect } from "@editor/tests/helpers/pdf-protection";
import { test, expect } from "@editor/tests/helpers/test-base";
import {
  liveApiHeaders,
  loadLiveAppConfig,
} from "@editor/tests/helpers/live-api";
import path from "node:path";
import fs from "node:fs";

const fixtures = path.join(import.meta.dirname, "../test-fixtures");
const reader = "opening-test-password";
const owner = "permissions-test-password";

test.beforeEach(async ({ page }) => {
  await loadLiveAppConfig(page);
});

test("saving protection opens the result as a reader and changing permissions preserves its opening password", async ({
  page,
}) => {
  await page.goto("/add-password");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(fixtures, "sample.pdf"));
  await page.getByLabel("Password to open", { exact: true }).fill(reader);
  await page.getByText("Restrict actions", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Prevent printing", exact: true })
    .check();
  const ownerInput = page.getByRole("textbox", {
    name: "New permissions password",
    exact: true,
  });
  await expect(
    page.getByText("Use a different password to change restrictions."),
  ).toHaveCount(0);
  await ownerInput.fill(reader);
  await expect(
    page.getByText("The two passwords must be different."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save protection", exact: true }),
  ).toBeDisabled();
  await ownerInput.fill(owner);
  const protection = page.waitForResponse("**/api/v1/security/add-password");
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
  const honor = readerAccess.honorOwnerPasswords !== false;
  await expect(
    page.getByText("Protection saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print PDF", exact: true }),
  ).toBeEnabled({ enabled: !honor });
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(
    page.getByText("Permissions unlocked for this session", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Change Permissions", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "Password to open the updated PDF",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", {
      name: "New permissions password",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Prevent printing", exact: true })
    .uncheck();
  const changed = page.waitForResponse("**/api/v1/security/add-password");
  await page
    .getByRole("button", { name: "Change Permissions", exact: true })
    .click();
  if (honor) {
    const dialog = page.getByRole("dialog", {
      name: "Enter permissions password",
      exact: true,
    });
    await dialog
      .getByLabel("Permissions password", { exact: true })
      .fill(reader);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog
      .getByLabel("Permissions password", { exact: true })
      .fill(owner);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  }
  const changedResponse = await changed;
  expect(changedResponse.ok()).toBe(true);
  const saved = await changedResponse.body();
  expect(await inspect(page, saved, reader)).toMatchObject({
    requiresOpeningPassword: true,
    ownerAuthenticated: false,
    canPrint: true,
  });
  expect(await inspect(page, saved, owner)).toMatchObject({
    ownerAuthenticated: true,
  });
  await expect(
    page.getByText("Protection saved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print PDF", exact: true }),
  ).toBeEnabled();
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
  test(`${action} follows the owner policy in a fresh session`, async ({
    page,
  }) => {
    const buffer = fs.readFileSync(
      path.join(fixtures, "owner-only-restricted.pdf"),
    );
    const honorOwnerPasswords =
      (await inspect(page, buffer, "")).honorOwnerPasswords !== false;
    const endpoint =
      action === "Change Permissions" ? "add-password" : "remove-password";
    const denied = await page.request.post(`/api/v1/security/${endpoint}`, {
      headers: await liveApiHeaders(page),
      multipart: {
        fileInput: {
          name: "restricted.pdf",
          mimeType: "application/pdf",
          buffer,
        },
        password: "",
        sourcePassword: "",
        preserveExisting: action === "Change Permissions",
        removeAll: action !== "Change Permissions",
      },
    });
    expect(denied.status()).toBe(honorOwnerPasswords ? 403 : 200);
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
    if (!honorOwnerPasswords) {
      await expect(
        page.getByRole("button", { name: "Print PDF", exact: true }),
      ).toBeEnabled();
      await expect(
        page.getByText("Required to apply changes", { exact: true }),
      ).toHaveCount(0);
      if (action === "Change Permissions") {
        await expect(
          page.getByRole("button", { name: action, exact: true }),
        ).toBeEnabled();
      } else {
        await page
          .getByRole("button", { name: "Manage protection", exact: true })
          .click();
        await page.getByRole("button", { name: action, exact: true }).click();
      }
      const response = page.waitForResponse(`**/api/v1/security/${endpoint}`);
      await page.getByRole("button", { name: action, exact: true }).click();
      const result = await response;
      expect(result.ok()).toBe(true);
      expect(changes).toBe(1);
      await expect(
        page.getByRole("dialog", {
          name: "Enter permissions password",
          exact: true,
        }),
      ).toHaveCount(0);
      const output = await result.body();
      expect(await inspect(page, output, "")).toMatchObject({
        encrypted: action === "Change Permissions",
      });
      if (action === "Change Permissions") {
        expect(
          await inspect(page, output, "owner-test-password"),
        ).toMatchObject({
          ownerAuthenticated: true,
        });
      }
      return;
    }
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
      await expect(page.getByText("Printing", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: action, exact: true }).click();
    }
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(
      page.getByRole("dialog", {
        name: "Enter permissions password",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "Enter permissions password", exact: true })
      .getByRole("button", { name: "Close", exact: true })
      .click();
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
        page.getByText("Protected PDF", {
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
    ).toBeEnabled({ enabled: action === "Create an unprotected copy" });
  });
}

test("a PDF with only an opening password opens and prints after removing its opening requirement", async ({
  page,
}) => {
  await page.goto("/add-password");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(fixtures, "sample.pdf"));
  await page.getByLabel("Password to open", { exact: true }).fill(reader);
  const protectedResponse = page.waitForResponse(
    "**/api/v1/security/add-password",
  );
  await page
    .getByRole("button", { name: "Save protection", exact: true })
    .click();
  const result = await protectedResponse;
  expect(result.ok()).toBe(true);
  expect(await inspect(page, await result.body(), reader)).toMatchObject({
    encrypted: true,
    requiresOpeningPassword: true,
    canPrint: true,
  });
  await expect(
    page.getByText("Protection saved", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Remove Password", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByLabel("Permissions password", { exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Password to open", { exact: true }).fill(reader);
  const removedResponse = page.waitForResponse(
    "**/api/v1/security/remove-password",
  );
  await page
    .getByRole("button", { name: "Remove Password", exact: true })
    .click();
  const removed = await removedResponse;
  expect(removed.ok()).toBe(true);
  expect(await inspect(page, await removed.body(), "")).toMatchObject({
    requiresOpeningPassword: false,
    canPrint: true,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Print PDF", exact: true }).click();
  await expect(page.locator('iframe[title="Print Document"]')).toHaveAttribute(
    "src",
    /^blob:/,
  );
});

test("replacing the permissions password follows the owner policy and invalidates the old credential", async ({
  page,
}) => {
  const honorOwnerPasswords =
    (
      await inspect(
        page,
        fs.readFileSync(path.join(fixtures, "owner-only-restricted.pdf")),
        "",
      )
    ).honorOwnerPasswords !== false;
  await page.goto("/change-permissions");
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(fixtures, "owner-only-restricted.pdf"));
  await expect(page.getByText("Protected PDF", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "Change permissions password",
      exact: true,
    })
    .check();
  await page
    .getByRole("textbox", { name: "New permissions password", exact: true })
    .fill(owner);
  const changedResponse = page.waitForResponse(
    "**/api/v1/security/add-password",
  );
  await page
    .getByRole("button", { name: "Change Permissions", exact: true })
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
      .fill("owner-test-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  } else {
    await expect(
      page.getByRole("dialog", {
        name: "Enter permissions password",
        exact: true,
      }),
    ).toHaveCount(0);
  }
  const changed = await changedResponse;
  expect(changed.ok()).toBe(true);
  const buffer = await changed.body();
  expect(await inspect(page, buffer, owner)).toMatchObject({
    ownerAuthenticated: true,
  });
  expect(await inspect(page, buffer, "")).toMatchObject({
    ownerAuthenticated: false,
    canPrint: false,
  });
  await expect(inspect(page, buffer, "owner-test-password")).rejects.toThrow(
    "PDF open failed",
  );
});

for (const tool of ["annotate", "form-fill", "redact"]) {
  test(`${tool} explains that protected editing is unsupported before offering an editable output`, async ({
    page,
  }) => {
    const honorOwnerPasswords =
      (
        await inspect(
          page,
          fs.readFileSync(path.join(fixtures, "owner-only-restricted.pdf")),
          "",
        )
      ).honorOwnerPasswords !== false;
    await page.goto(`/${tool}`);
    await page
      .getByTestId("file-input")
      .setInputFiles(path.join(fixtures, "owner-only-restricted.pdf"));
    const notice = page.getByTestId("tool-file-list");
    await expect(
      notice.getByText("owner-only-restricted.pdf", { exact: true }),
    ).toBeVisible();
    await expect(notice.getByRole("status")).toHaveCount(0);
    await expect(
      page.getByText("This tool cannot yet preserve this PDF's protection.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await notice.getByRole("button", { name: /Why .* is unavailable/ }).hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "This tool doesn't support encrypted PDFs. Remove the password first.",
    );
    const removePassword = notice.getByRole("button", {
      name: "Remove Password",
    });
    await removePassword.hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "Open Remove Password to choose which passwords to remove.",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Print PDF", exact: true }),
    ).toBeEnabled({ enabled: !honorOwnerPasswords });
    await removePassword.click();
    await expect(page).toHaveURL(/\/remove-password$/);
  });
}
