import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({ stubOptions: { enableLogin: true, isAdmin: true }, seedJwt: true });

test("owner permissions default on and an administrator can save an explicit off value", async ({
  page,
}) => {
  let pending: boolean | undefined;
  await page.route("**/api/v1/admin/settings/section/security", (route) =>
    route.fulfill({
      json: {
        enableLogin: true,
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
      pending = false;
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/settings/adminSecurity#pdfPermissions");
  const card = page.locator(".settings-card").filter({
    has: page.getByRole("button", { name: "PDF permissions", exact: true }),
  });
  await expect(card.getByRole("switch")).toBeChecked();
  await page.screenshot({
    path: test.info().outputPath("owner-policy-setting-default.png"),
  });
  await card.locator(".mantine-Switch-track").click();
  await expect(card.getByRole("switch")).not.toBeChecked();
  await page.getByRole("button", { name: "Save Changes", exact: true }).click();
  await expect
    .poll(() => saved)
    .toContainEqual({ settings: { "security.honorOwnerPasswords": false } });
  await expect(page.getByRole("dialog")).toBeVisible();
});
