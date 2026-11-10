import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

test.use({ stubOptions: { enableLogin: true, isAdmin: true }, seedJwt: true });

function toggleRow(page: Page, label: string) {
  return page
    .locator(".settings-card")
    .filter({
      has: page.getByRole("button", { name: "PDF permissions", exact: true }),
    })
    .locator(".settings-toggle")
    .filter({ has: page.getByText(label, { exact: true }) });
}

for (const initial of [undefined, true, false]) {
  test(`an administrator can change owner enforcement from ${initial ?? "the default"} and reload the pending value`, async ({
    page,
  }) => {
    const expectedInitial = initial ?? true;
    const target = !expectedInitial;
    let pending: boolean | undefined;
    await page.route("**/api/v1/admin/settings/section/security", (route) =>
      route.fulfill({
        json: {
          enableLogin: true,
          ...(initial === undefined ? {} : { honorOwnerPasswords: initial }),
          ...(pending === undefined
            ? {}
            : { _pending: { honorOwnerPasswords: pending } }),
        },
      }),
    );
    const saved: unknown[] = [];
    await page.route("**/api/v1/admin/settings", (route) => {
      if (route.request().method() === "PUT") {
        saved.push(route.request().postDataJSON());
        pending = target;
      }
      return route.fulfill({ json: {} });
    });
    await page.goto("/settings/adminSecurity#pdfPermissions");
    const row = toggleRow(page, "Honor PDF permissions");
    await expect(row.getByRole("switch")).toBeChecked({
      checked: expectedInitial,
    });
    await page.screenshot({
      path: test.info().outputPath("owner-policy-setting-default.png"),
    });
    await row.locator(".mantine-Switch-track").click();
    await expect(row.getByRole("switch")).toBeChecked({ checked: target });
    await page
      .getByRole("button", { name: "Save Changes", exact: true })
      .click();
    await expect
      .poll(() => saved)
      .toContainEqual({ settings: { "security.honorOwnerPasswords": target } });
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.reload();
    await expect(row.getByRole("switch")).toBeChecked({ checked: target });
  });
}

test("an administrator can block changes to signed PDFs", async ({ page }) => {
  await page.route("**/api/v1/admin/settings/section/security", (route) =>
    route.fulfill({ json: { enableLogin: true } }),
  );
  const saved: unknown[] = [];
  await page.route("**/api/v1/admin/settings", (route) => {
    if (route.request().method() === "PUT") {
      saved.push(route.request().postDataJSON());
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/settings/adminSecurity#pdfPermissions");
  const row = toggleRow(page, "Block changes to signed PDFs");
  await expect(row.getByRole("switch")).toBeChecked({ checked: false });
  await row.locator(".mantine-Switch-track").click();
  await expect(row.getByRole("switch")).toBeChecked({ checked: true });
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect
    .poll(() => saved)
    .toContainEqual({ settings: { "security.blockSignedPdfEdits": true } });
});
