import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "node:path";
import fs from "node:fs";

const fixture = path.join(
  import.meta.dirname,
  "../test-fixtures/owner-only-restricted.pdf",
);
const sample = fs.readFileSync(
  path.join(import.meta.dirname, "../test-fixtures/sample.pdf"),
);

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/security/inspect-pdf-security", (route) => {
    const body = route.request().postData() ?? "";
    const password = /name="password"\r\n\r\n([^\r]*)/.exec(body)?.[1] ?? "";
    if (password && password !== "owner-test-password")
      return route.fulfill({
        status: 400,
        json: { type: "/errors/pdf-password", status: 400 },
      });
    return route.fulfill({
      json: {
        encrypted: true,
        requiresOpeningPassword: false,
        signed: false,
        ownerAuthenticated: password === "owner-test-password",
        permissions: 0,
        encryptionKeyLength: 256,
        encryptionRevision: 6,
        credentialFingerprint: "fixture-credentials",
        canModify: password !== "",
        canAssemble: password !== "",
        pageCount: 1,
      },
    });
  });
});

test("restricted compression prompts at execution, preserves settings on cancel, and continues after verification", async ({
  page,
}) => {
  let compressions = 0;
  await page.route("**/api/v1/security/prepare-pdf-session", (route) =>
    route.fulfill({ contentType: "application/pdf", body: sample }),
  );
  await page.route("**/api/v1/misc/compress-pdf", (route) => {
    compressions++;
    return route.fulfill({ contentType: "application/pdf", body: sample });
  });
  await page.route("**/api/v1/security/restore-pdf-protection", (route) =>
    route.fulfill({
      contentType: "application/pdf",
      body: fs.readFileSync(fixture),
    }),
  );
  await page.goto("/compress");
  await page.getByTestId("files-button").click();
  await page.getByTestId("file-input").setInputFiles(fixture);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await expect(
    page.getByText("This PDF requires permission to use Compress."),
  ).toBeVisible();
  expect(compressions).toBe(0);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  await page
    .getByLabel("Permissions password", { exact: true })
    .fill("incorrect");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Incorrect password" }),
  ).toBeVisible();
  expect(compressions).toBe(0);
  await page
    .getByLabel("Permissions password", { exact: true })
    .fill("owner-test-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByText("Protection retained", { exact: true }),
  ).toBeVisible();
  expect(compressions).toBe(1);
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(page.getByText("Not required", { exact: true })).toBeVisible();
  const unlockedPrinting = page.getByRole("dialog").getByRole("button", {
    name: "Printing unlocked for this session",
    exact: true,
  });
  await expect(unlockedPrinting).toBeVisible();
  await unlockedPrinting.focus();
  await expect(unlockedPrinting).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText(
    "Unlocked for this session using your permissions password.",
  );
  await expect(
    page.getByRole("button", { name: "Remove Password", exact: true }),
  ).toBeEnabled();
});

test("unsupported tools keep the explanation in a tooltip and offer Remove Password", async ({
  page,
}) => {
  await page.goto("/redact");
  await page.getByTestId("files-button").click();
  await page.getByTestId("file-input").setInputFiles(fixture);
  const notice = page.getByTestId("tool-file-list");
  await expect(notice.getByRole("status")).toHaveCount(0);
  await notice.getByRole("button", { name: /Why .* is unavailable/ }).hover();
  await expect(page.getByRole("tooltip")).toHaveText(
    "This tool doesn't support encrypted PDFs. Remove the password first.",
  );
  await notice.getByText("owner-only-restricted.pdf", { exact: true }).click();
  await expect(page.getByRole("tooltip")).toBeHidden();
  await expect(
    notice.getByRole("button", { name: "Remove Password" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Enter permissions password",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Verify permissions for this session",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Permissions password", { exact: true })
    .fill("owner-test-password");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page
      .getByText("Permissions unlocked for this session", { exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    notice.getByRole("button", { name: /Why .* is unavailable/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Manage protection", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Create an unprotected copy",
      exact: true,
    }),
  ).toBeVisible();
});
