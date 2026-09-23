import { test, expect } from "@app/tests/helpers/stub-test-base";

const admin = {
  id: 1,
  username: "admin",
  role: "ROLE_ADMIN",
  portalAccess: true,
};

test.use({
  autoGoto: false,
  stubOptions: { enableLogin: true, isAdmin: true, user: admin },
});

test.beforeEach(async ({ page, context }) => {
  let signedIn = false;
  await context.route("**/api/v1/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ json: { user: signedIn ? admin : null } }),
  );
  await page.route("**/api/v1/proprietary/ui-data/login", (route) =>
    route.fulfill({
      json: {
        enableLogin: true,
        loginMethod: "normal",
        firstTimeSetup: true,
        showDefaultCredentials: true,
      },
    }),
  );
  await page.route("**/api/v1/proprietary/ui-data/account", (route) =>
    route.fulfill({
      json: { ...admin, settings: "{}", changeCredsFlag: true },
    }),
  );
  await page.route("**/api/v1/auth/login", (route) => {
    signedIn = true;
    return route.fulfill({
      json: {
        user: admin,
        session: {
          access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature",
          expires_in: 3600,
        },
      },
    });
  });
});

for (const path of [
  "/",
  "/editor?view=all#latest",
  "/processor",
  "/processor/policies?view=all#latest",
]) {
  for (const reload of [false, true]) {
    test(`uses the shared first-startup login when opening ${path}${reload ? " after reloading login" : ""}`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === "/login" &&
          (path === "/" || url.searchParams.get("from") === path),
      );
      await expect(
        page.getByText("Default Login Credentials", { exact: true }),
      ).toBeVisible();

      if (reload) await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator("#email").fill("admin");
      await page.locator("#password").fill("stirling");
      await page.getByRole("button", { name: "Login", exact: true }).click();

      if (path !== "/") {
        await expect(page).toHaveURL(
          (url) => url.pathname + url.search + url.hash === path,
        );
      }
      await expect(
        page
          .getByRole("dialog", { name: "Onboarding", exact: true })
          .getByRole("textbox", { name: "New Password", exact: true }),
      ).toBeVisible();
    });
  }
}
