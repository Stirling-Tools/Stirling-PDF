import type { Page } from "@playwright/test";
import path from "node:path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

const SIGNED = path.join(
  import.meta.dirname,
  "../test-fixtures/signed-sample.pdf",
);

async function openSigned(page: Page, route: string, block: boolean) {
  await page.route("**/api/v1/config/app-config", (r) =>
    r.fulfill({
      json: {
        enableLogin: false,
        isAdmin: false,
        languages: ["en-US"],
        defaultLocale: "en-US",
        blockSignedPdfEdits: block,
      },
    }),
  );
  await page.route("**/api/v1/form/fields-with-coordinates", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await uploadFiles(page, SIGNED);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
}

const unavailable = (page: Page) =>
  page.getByRole("button", {
    name: "Why signed-sample.pdf is unavailable",
    exact: true,
  });

test("Annotate explains why a signed PDF is left out while changes are blocked", async ({
  page,
}) => {
  await openSigned(page, "/annotate", true);
  await expect(unavailable(page)).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("button", { name: "Highlight", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Remove Password", exact: true }),
  ).toHaveCount(0);
  await unavailable(page).hover();
  await expect(page.getByRole("tooltip")).toContainText("digitally signed");
});

test("Annotate edits a signed PDF while changes are allowed", async ({
  page,
}) => {
  await openSigned(page, "/annotate", false);
  await expect(
    page.getByRole("button", { name: "Highlight", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(unavailable(page)).toHaveCount(0);
});

test("the form editor locks a signed PDF while changes are blocked", async ({
  page,
}) => {
  await openSigned(page, "/form-fill", true);
  await expect(unavailable(page)).toBeVisible({ timeout: 30_000 });
  await expect(
    page
      .locator(".mantine-SegmentedControl-label")
      .filter({ hasText: "Create" }),
  ).toHaveCount(0);
});

test("the form editor edits a signed PDF while changes are allowed", async ({
  page,
}) => {
  await openSigned(page, "/form-fill", false);
  await expect(
    page
      .locator(".mantine-SegmentedControl-label")
      .filter({ hasText: "Create" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(unavailable(page)).toHaveCount(0);
});

for (const block of [true, false]) {
  test(`the viewer ${block ? "shows" : "hides"} the signed lock chip while changes are ${block ? "blocked" : "allowed"}`, async ({
    page,
  }) => {
    await openSigned(page, "/editor", block);
    await expect(page.getByTestId("annotations-toggle")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Signed: edits blocked")).toHaveCount(
      block ? 1 : 0,
    );
  });

  test(`Compress ${block ? "leaves out" : "accepts"} a signed PDF while changes are ${block ? "blocked" : "allowed"}`, async ({
    page,
  }) => {
    await openSigned(page, "/compress", block);
    if (block) {
      await expect(unavailable(page)).toBeVisible({ timeout: 30_000 });
      await unavailable(page).hover();
      await expect(page.getByRole("tooltip")).toContainText("digitally signed");
      return;
    }
    await expect(page.locator('[data-tour="run-button"]')).toBeEnabled({
      timeout: 30_000,
    });
    await expect(unavailable(page)).toHaveCount(0);
  });

  test(`Add Text ${block ? "leaves out" : "accepts"} a signed PDF while changes are ${block ? "blocked" : "allowed"}`, async ({
    page,
  }) => {
    await openSigned(page, "/add-text", block);
    const textInput = page.getByPlaceholder("Enter the text you want to add");
    if (block) {
      await expect(unavailable(page)).toBeVisible({ timeout: 30_000 });
      await expect(textInput).toHaveCount(0);
      return;
    }
    await expect(textInput).toBeVisible({ timeout: 30_000 });
    await expect(unavailable(page)).toHaveCount(0);
  });
}
