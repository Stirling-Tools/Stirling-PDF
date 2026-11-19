import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

interface RoleCase {
  name: string;
  enableLogin: boolean;
  isAdmin: boolean;
  user: {
    id: number;
    username: string;
    role: string;
    portalAccess?: boolean;
    orgOwner?: boolean;
  } | null;
  shortcuts: { label: string; key: string; anchor?: string }[];
  signOut: boolean;
}

const cases: RoleCase[] = [
  {
    name: "login off",
    enableLogin: false,
    isAdmin: true,
    user: null,
    shortcuts: [
      { label: "Appearance", key: "general", anchor: "appearance" },
      { label: "Keyboard Shortcuts", key: "general", anchor: "hotkeys" },
    ],
    signOut: false,
  },
  {
    name: "user",
    enableLogin: true,
    isAdmin: false,
    user: { id: 3, username: "member", role: "ROLE_USER" },
    shortcuts: [{ label: "API Keys", key: "api-keys" }],
    signOut: true,
  },
  {
    name: "admin",
    enableLogin: true,
    isAdmin: true,
    user: { id: 2, username: "admin", role: "ROLE_ADMIN", orgOwner: false },
    shortcuts: [
      { label: "Users", key: "users" },
      { label: "Server settings", key: "adminGeneral" },
    ],
    signOut: true,
  },
  {
    name: "owner without processor access",
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "owner",
      role: "ROLE_ADMIN",
      orgOwner: true,
      portalAccess: false,
    },
    shortcuts: [
      { label: "Users", key: "users" },
      { label: "Server settings", key: "adminGeneral" },
    ],
    signOut: true,
  },
  {
    name: "owner with processor access",
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "owner",
      role: "ROLE_ADMIN",
      orgOwner: true,
      portalAccess: true,
    },
    shortcuts: [
      { label: "Users", key: "users" },
      { label: "Server settings", key: "adminGeneral" },
      { label: "Usage & Billing", key: "billing" },
    ],
    signOut: true,
  },
];

async function openMenu(page: Page) {
  await page.locator('[data-testid="config-button"]').first().click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

for (const c of cases) {
  test.describe(`self-hosted ${c.name}`, () => {
    test.use({
      seedJwt: c.user !== null,
      stubOptions: {
        enableLogin: c.enableLogin,
        isAdmin: c.isAdmin,
        user: c.user,
      },
    });

    test("menu lists exactly the pages this role can open", async ({
      page,
    }) => {
      const menu = await openMenu(page);
      const labels = await menu.getByRole("menuitem").allInnerTexts();
      expect(labels.map((l) => l.trim())).toEqual([
        "Settings",
        ...c.shortcuts.map((s) => s.label),
        ...(c.signOut ? ["Log out"] : []),
      ]);
    });

    for (const shortcut of c.shortcuts) {
      test(`${shortcut.label} opens its own enabled settings page`, async ({
        page,
      }) => {
        const menu = await openMenu(page);
        await menu
          .getByRole("menuitem", { name: shortcut.label, exact: true })
          .click();
        await expect(page).toHaveURL(
          new RegExp(`/settings/${shortcut.key}(#.*)?$`),
        );
        const current = page.locator(
          `.modal-nav-item[data-tour="admin-${shortcut.key}-nav"]`,
        );
        await expect(current).toHaveAttribute("aria-current", "page");
        await expect(current).not.toHaveAttribute("aria-disabled", "true");
        await expect(page).toHaveURL(
          new RegExp(`/settings/${shortcut.key}(#.*)?$`),
        );
        if (shortcut.anchor) {
          const card = page.locator(`#${shortcut.anchor}`);
          await expect(card).toBeVisible();
          await expect(card).toBeInViewport();
        }
      });
    }

    test("Settings opens an enabled page", async ({ page }) => {
      const menu = await openMenu(page);
      await menu
        .getByRole("menuitem", { name: "Settings", exact: true })
        .click();
      const current = page.locator('.modal-nav-item[aria-current="page"]');
      await expect(current).toBeVisible();
      await expect(current).not.toHaveAttribute("aria-disabled", "true");
    });
  });
}
