import { test, expect } from "@editor/tests/helpers/stub-test-base";
import path from "node:path";
import fs from "node:fs";
import { PDFDocument } from "@cantoo/pdf-lib";

const fixture = path.join(
  import.meta.dirname,
  "../test-fixtures/owner-only-restricted.pdf",
);
const sample = fs.readFileSync(
  path.join(import.meta.dirname, "../test-fixtures/sample.pdf"),
);

for (const entry of ["opening dialog", "Remove Password tool"]) {
  test(`${entry} retains owner protection using local authentication`, async ({
    page,
  }) => {
    const original = await PDFDocument.load(sample);
    original.encrypt({
      userPassword: "local-reader",
      ownerPassword: "local-owner",
      permissions: { printing: false },
    });
    const output = await PDFDocument.load(sample);
    output.encrypt({
      userPassword: "",
      ownerPassword: "local-owner",
      permissions: { printing: false },
    });
    const outputBytes = Buffer.from(await output.save());
    let removals = 0;
    await page.route("**/api/v1/security/remove-password", async (route) => {
      const request = new Request(route.request().url(), {
        method: "POST",
        headers: route.request().headers(),
        body: new Uint8Array(route.request().postDataBuffer()!),
      });
      const form = await request.formData();
      expect(form.get("password")).toBe("local-reader");
      expect(form.get("sourcePassword")).toBe("local-owner");
      expect(form.get("ownerPassword")).toBeFalsy();
      removals++;
      await route.fulfill({
        contentType: "application/pdf",
        body: outputBytes,
      });
    });
    await page.goto(
      entry === "opening dialog" ? "/editor" : "/remove-password",
    );
    await page.getByTestId("file-input").setInputFiles({
      name: "protected.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(await original.save()),
    });
    const opening = page.getByRole("dialog", { name: /^Open PDF/ });
    await opening
      .getByLabel("Password to open", { exact: true })
      .fill("local-reader");
    if (entry === "opening dialog") {
      await opening
        .getByRole("button", { name: "Remove Password", exact: true })
        .click();
    } else {
      await opening
        .getByRole("button", { name: "Open PDF", exact: true })
        .click();
      await expect(opening).toBeHidden();
      await page
        .getByLabel("Password to open", { exact: true })
        .fill("local-reader");
      await page
        .getByRole("button", { name: /^Remove Password(?: \(this file\))?$/ })
        .click();
    }
    const verification = page.getByRole("dialog", {
      name: "Enter permissions password",
      exact: true,
    });
    await expect(
      verification.getByText(/This will not remove it/),
    ).toBeVisible();
    await verification
      .getByLabel("Permissions password", { exact: true })
      .fill("local-owner");
    await verification
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(verification).toBeHidden();
    await expect(
      page.getByText("Protected PDF", { exact: true }).first(),
    ).toBeVisible();
    expect(removals).toBe(1);
  });
}

for (const { name, route } of [
  { name: "Remove Password", route: "/remove-password" },
  { name: "Change Permissions", route: "/change-permissions" },
]) {
  test(`Manage protection opens ${name} from All Tools`, async ({ page }) => {
    await page.goto("/compress");
    await page.getByTestId("file-input").setInputFiles(fixture);
    await expect(
      page.getByRole("button", { name: "Manage protection", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Back to all tools", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Search tools", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Manage protection", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(route);
    await expect(page.getByTestId("tool-file-list")).toContainText(
      "owner-only-restricted.pdf",
    );
    await expect(
      page.getByRole("button", { name: "Back to all tools", exact: true }),
    ).toBeVisible();
  });
}

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
