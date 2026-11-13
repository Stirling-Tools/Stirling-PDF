import { test, expect } from "@editor/tests/helpers/stub-test-base";

const LONG_NAME = "alexandra.montgomery-fitzwilliam@example-corporation.com";

test.use({
  seedJwt: true,
  stubOptions: {
    enableLogin: true,
    user: {
      id: 3,
      username: LONG_NAME,
      email: LONG_NAME,
      role: "ROLE_USER",
      roles: ["ROLE_USER"],
    },
  },
});

test("a long account name truncates instead of widening the avatar menu", async ({
  page,
}) => {
  await page.locator('[data-testid="config-button"]').first().click();
  const menu = page.getByRole("menu");
  await expect(
    menu.getByRole("menuitem", { name: "Settings", exact: true }),
  ).toBeVisible();

  const name = menu.getByText(LONG_NAME, { exact: true });
  await expect(name).toBeVisible();
  const { menuWidth, nameClipped } = await name.evaluate((el) => ({
    menuWidth: el.closest('[role="menu"]')!.getBoundingClientRect().width,
    nameClipped: el.scrollWidth > el.clientWidth,
  }));
  const rootFontSize = await page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize),
  );
  expect(menuWidth).toBeLessThanOrEqual(18 * rootFontSize);
  expect(nameClipped).toBe(true);
});
