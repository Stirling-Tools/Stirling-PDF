import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "node:path";
import { openSettings } from "@app/tests/helpers/ui-helpers";
import { THUMBS, FULLS } from "@app/tests/stubbed/avatar-fixtures";

/**
 * Screenshot walkthrough of per-user profile pictures; dumps PNGs to
 * screenshots/profile-pictures. Throwaway harness for the UI report, not a assertion suite.
 */

const SCREENSHOTS_DIR = path.resolve(
  process.cwd(),
  "screenshots",
  "profile-pictures",
);

function shotPath(name: string): string {
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

async function settle(page: Page, ms = 450): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Ids 1-6 mirror a small org: three of six people have uploaded a picture. */
const ROSTER = [
  { id: 1, username: "ana.oyelaran", team: "Design", avatar: "ana" },
  { id: 2, username: "bruno.katz", team: "Design", avatar: "bruno" },
  { id: 3, username: "chen.wei", team: "Design", avatar: null },
  { id: 4, username: "dara.singh", team: "Engineering", avatar: "dara" },
  { id: 5, username: "eli.novak", team: "Engineering", avatar: null },
  { id: 6, username: "fatima.rahman", team: "Engineering", avatar: null },
];

const TEAMS = [
  { id: 1, name: "Design" },
  { id: 2, name: "Engineering" },
];

function adminSettingsPayload() {
  return {
    users: ROSTER.map((u) => ({
      id: u.id,
      username: u.username,
      email: `${u.username}@example.com`,
      roleName: "adminUserSettings.user",
      rolesAsString: u.id === 1 ? "ROLE_ADMIN" : "ROLE_USER",
      enabled: u.id !== 6,
      authenticationType: "web",
      team: { id: u.team === "Design" ? 1 : 2, name: u.team },
      hasProfilePicture: u.avatar !== null,
      portalAccess: u.id === 1,
      teamLead: u.id === 4,
    })),
    userSessions: { "ana.oyelaran": true, "dara.singh": true },
    userLastRequest: {
      "ana.oyelaran": Date.now() - 60_000,
      "bruno.katz": Date.now() - 3_600_000,
      "chen.wei": Date.now() - 86_400_000,
      "dara.singh": Date.now() - 120_000,
    },
    userSettings: {},
    lockedUsers: [],
    totalUsers: ROSTER.length,
    activeUsers: 2,
    disabledUsers: 1,
    currentUsername: "ana.oyelaran",
    maxAllowedUsers: 100,
    availableSlots: 94,
    grandfatheredUserCount: 0,
    licenseMaxUsers: 100,
    premiumEnabled: true,
    mailEnabled: true,
    emailInvitesEnabled: true,
    teams: TEAMS,
    roleDetails: { ROLE_ADMIN: "Admin", ROLE_USER: "User" },
  };
}

/** Everything the avatar surfaces need. `ownAvatar` drives the signed-in user's own picture. */
async function stubAvatarApis(
  page: Page,
  opts: { ownAvatar?: string | null } = {},
): Promise<void> {
  const { ownAvatar = "ana" } = opts;

  await page.route("**/api/v1/user/profile-picture", async (route: Route) => {
    if (route.request().method() !== "GET") {
      return route.fulfill({ json: { hasProfilePicture: true } });
    }
    if (!ownAvatar) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(FULLS[ownAvatar], "base64"),
    });
  });

  await page.route("**/api/v1/user/profile-pictures*", (route: Route) => {
    const requested =
      new URL(route.request().url()).searchParams
        .get("userIds")
        ?.split(",")
        .filter(Boolean) ?? [];
    const body: Record<string, string> = {};
    for (const id of requested) {
      const person = ROSTER.find((u) => String(u.id) === id);
      if (person?.avatar) {
        body[id] = `data:image/png;base64,${THUMBS[person.avatar]}`;
      }
    }
    return route.fulfill({ json: body });
  });

  await page.route("**/ui-data/admin-settings", (route: Route) =>
    route.fulfill({ json: adminSettingsPayload() }),
  );
  await page.route("**/ui-data/account", (route: Route) =>
    route.fulfill({
      json: {
        username: "ana.oyelaran",
        role: "ROLE_ADMIN",
        settings: "{}",
        changeCredsFlag: false,
        oAuth2Login: false,
        saml2Login: false,
        mfaEnabled: false,
        mfaRequired: false,
      },
    }),
  );
  await page.route("**/ui-data/teams", (route: Route) =>
    route.fulfill({
      json: {
        teamsWithCounts: TEAMS.map((t) => ({
          id: t.id,
          name: t.name,
          userCount: ROSTER.filter((u) => u.team === t.name).length,
        })),
        teamLastRequest: {},
        teamOwners: { 2: ["dara.singh"] },
      },
    }),
  );
  await page.route("**/ui-data/teams/*", (route: Route) => {
    const teamId = Number(route.request().url().split("/").pop());
    const team = TEAMS.find((t) => t.id === teamId) ?? TEAMS[0];
    const members = ROSTER.filter(
      (u) => (u.team === "Design" ? 1 : 2) === teamId,
    );
    return route.fulfill({
      json: {
        team: { id: team.id, name: team.name },
        teamUsers: members.map((u) => ({
          id: u.id,
          username: u.username,
          email: `${u.username}@example.com`,
          enabled: true,
          roleName: "adminUserSettings.user",
          rolesAsString: "ROLE_USER",
          team: { id: team.id, name: team.name },
        })),
        availableUsers: [],
        userLastRequest: {},
        ownerUserIds: [4],
      },
    });
  });
  await page.route("**/api/v1/team/**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
}

/** The portal only mounts for a session carrying portalAccess (RequirePortalAccess). */
async function stubPortalSession(page: Page): Promise<void> {
  await page.route("**/api/v1/auth/me", (route: Route) =>
    route.fulfill({
      json: {
        user: {
          id: 1,
          username: "ana.oyelaran",
          email: "ana.oyelaran@example.com",
          roles: ["ROLE_ADMIN"],
          role: "ROLE_ADMIN",
          portalAccess: true,
          team: { id: 1, name: "Design" },
          enabled: true,
        },
        portalAccess: true,
      },
    }),
  );
  await page.route("**/api/v1/policies**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/access/**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
}

async function openAccountSection(page: Page): Promise<void> {
  await openSettings(page);
  await page.getByText("Account Settings", { exact: true }).first().click();
  await expect(page.getByText("Profile picture").first()).toBeVisible({
    timeout: 10_000,
  });
  await settle(page);
}

async function openWorkspaceSection(page: Page, label: string): Promise<void> {
  await openSettings(page);
  await page.getByText(label, { exact: true }).first().click();
  await settle(page, 1200);
}

/** Hand the profile-picture FilePicker a synthetic file, bypassing the OS dialog. */
async function pickAvatarFile(page: Page, sizeBytes: number): Promise<void> {
  const input = page.locator('input[type="file"][accept*="webp"]').last();
  await input.setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer:
      sizeBytes <= 0
        ? Buffer.from(FULLS.bruno, "base64")
        : Buffer.alloc(sizeBytes, 1),
  });
}

async function enableDarkMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function enableRtl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "ar-AR");
    localStorage.setItem("stirling-language", "ar-AR");
    localStorage.setItem("stirling-language-source", "user");
    const applyDir = () => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar-AR");
    };
    if (document.documentElement) applyDir();
    else document.addEventListener("DOMContentLoaded", applyDir);
  });
}

const LOGGED_IN = {
  autoGoto: false as const,
  viewport: { width: 1600, height: 1000 },
  seedJwt: true,
  stubOptions: {
    enableLogin: true,
    isAdmin: true,
    user: {
      id: 1,
      username: "ana.oyelaran",
      email: "ana.oyelaran@example.com",
      roles: ["ROLE_ADMIN"],
    },
  },
};

/* ── Light pass ─────────────────────────────────────────────────────────── */

test.describe("Profile pictures walkthrough", () => {
  test.use(LOGGED_IN);

  test("01_account_card_empty", async ({ page }) => {
    await stubAvatarApis(page, { ownAvatar: null });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await page.screenshot({ path: shotPath("01_account_card_empty_light") });
  });

  test("02_account_card_with_picture", async ({ page }) => {
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await page.screenshot({
      path: shotPath("02_account_card_with_picture_light"),
    });
  });

  test("03_cropper_modal", async ({ page }) => {
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await pickAvatarFile(page, 0);
    await expect(page.getByText("Crop Profile Picture")).toBeVisible({
      timeout: 10_000,
    });
    await settle(page, 900);
    await page.screenshot({ path: shotPath("03_cropper_modal_light") });
  });

  test("04_size_error", async ({ page }) => {
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await pickAvatarFile(page, 6 * 1024 * 1024);
    await expect(page.getByText(/smaller than 5MB/i)).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("04_size_error_light") });
  });

  test("05_sidebar_avatar", async ({ page }) => {
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".file-sidebar-bottom-avatar--picture"),
    ).toBeVisible({ timeout: 10_000 });
    await settle(page);
    await page.screenshot({ path: shotPath("05_sidebar_avatar_light") });
  });

  test("06_sidebar_initials", async ({ page }) => {
    await stubAvatarApis(page, { ownAvatar: null });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".file-sidebar-bottom-avatar")).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("06_sidebar_initials_light") });
  });

  test("07_people_roster", async ({ page }) => {
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openWorkspaceSection(page, "People");
    await page.screenshot({ path: shotPath("07_people_roster_light") });
  });

  test("08_team_details", async ({ page }) => {
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openWorkspaceSection(page, "Teams");
    const row = page.getByText("Design", { exact: true }).first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await settle(page, 1200);
    }
    await page.screenshot({ path: shotPath("08_team_details_light") });
  });

  test("09_portal_users", async ({ page }) => {
    await stubAvatarApis(page);
    await stubPortalSession(page);
    await page.goto("/processor/users", { waitUntil: "domcontentloaded" });
    await settle(page, 2500);
    await page.screenshot({ path: shotPath("09_portal_users_light") });
  });

  /* ── Dark pass ────────────────────────────────────────────────────────── */

  test("01_account_card_empty_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page, { ownAvatar: null });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await page.screenshot({ path: shotPath("01_account_card_empty_dark") });
  });

  test("02_account_card_with_picture_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await page.screenshot({
      path: shotPath("02_account_card_with_picture_dark"),
    });
  });

  test("03_cropper_modal_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await pickAvatarFile(page, 0);
    await expect(page.getByText("Crop Profile Picture")).toBeVisible({
      timeout: 10_000,
    });
    await settle(page, 900);
    await page.screenshot({ path: shotPath("03_cropper_modal_dark") });
  });

  test("04_size_error_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await pickAvatarFile(page, 6 * 1024 * 1024);
    await expect(page.getByText(/smaller than 5MB/i)).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("04_size_error_dark") });
  });

  test("05_sidebar_avatar_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".file-sidebar-bottom-avatar--picture"),
    ).toBeVisible({ timeout: 10_000 });
    await settle(page);
    await page.screenshot({ path: shotPath("05_sidebar_avatar_dark") });
  });

  test("06_sidebar_initials_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page, { ownAvatar: null });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".file-sidebar-bottom-avatar")).toBeVisible({
      timeout: 10_000,
    });
    await settle(page);
    await page.screenshot({ path: shotPath("06_sidebar_initials_dark") });
  });

  test("07_people_roster_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openWorkspaceSection(page, "People");
    await page.screenshot({ path: shotPath("07_people_roster_dark") });
  });

  test("08_team_details_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openWorkspaceSection(page, "Teams");
    const row = page.getByText("Design", { exact: true }).first();
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await settle(page, 1200);
    }
    await page.screenshot({ path: shotPath("08_team_details_dark") });
  });

  test("09_portal_users_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page);
    await stubPortalSession(page);
    await page.goto("/processor/users", { waitUntil: "domcontentloaded" });
    await settle(page, 2500);
    await page.screenshot({ path: shotPath("09_portal_users_dark") });
  });

  test("12_remove_confirm", async ({ page }) => {
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText("Remove profile picture")).toBeVisible({
      timeout: 10_000,
    });
    await settle(page, 700);
    await page.screenshot({ path: shotPath("12_remove_confirm_light") });
  });

  test("12_remove_confirm_dark", async ({ page }) => {
    await enableDarkMode(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openAccountSection(page);
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText("Remove profile picture")).toBeVisible({
      timeout: 10_000,
    });
    await settle(page, 700);
    await page.screenshot({ path: shotPath("12_remove_confirm_dark") });
  });

  /* ── RTL pass (layout-sensitive views only) ───────────────────────────── */

  test("10_account_card_rtl", async ({ page }) => {
    await enableRtl(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openSettings(page);
    await settle(page, 1200);
    await page.screenshot({ path: shotPath("10_account_card_rtl_light") });
  });

  test("11_people_roster_rtl", async ({ page }) => {
    await enableRtl(page);
    await stubAvatarApis(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await openSettings(page);
    await settle(page, 1500);
    await page.screenshot({ path: shotPath("11_people_roster_rtl_light") });
  });
});
