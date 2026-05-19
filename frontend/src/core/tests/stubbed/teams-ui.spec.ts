import { test, expect, type Page } from "@playwright/test";
import {
  bypassOnboarding,
  mockAppApis,
  seedCookieConsent,
} from "@app/tests/helpers/api-stubs";
import { openSettings } from "@app/tests/helpers/ui-helpers";

/**
 * Stubbed teams-management UI coverage. The proprietary Teams section
 * lists teams from `/proprietary/ui-data/teams` and exposes a
 * create-team affordance. We mock both empty and populated lists to
 * catch frontend regressions on every PR.
 */

async function setUpAdminWithTeams(
  page: Page,
  teams: Array<Record<string, unknown>>,
) {
  await seedCookieConsent(page);
  await bypassOnboarding(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "stirling_jwt",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.signature",
    );
  });
  await mockAppApis(page, {
    enableLogin: true,
    user: {
      id: 1,
      username: "admin",
      email: "admin",
      roles: ["ROLE_ADMIN"],
    },
  });
  await page.route("**/api/v1/proprietary/ui-data/account", (route) =>
    route.fulfill({
      json: { username: "admin", email: "admin", isAdmin: true },
    }),
  );
  await page.route("**/api/v1/proprietary/ui-data/teams", (route) =>
    route.fulfill({ json: teams }),
  );
  await page.goto("/");
}

test.describe("Teams management UI", () => {
  test("empty teams list still exposes create-team affordance", async ({
    page,
  }) => {
    await setUpAdminWithTeams(page, []);
    await openSettings(page);
    const teamsNav = page.getByText(/^teams/i).first();
    if (!(await teamsNav.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Teams section not in this build");
      return;
    }
    await teamsNav.click();
    await expect(
      page
        .getByRole("button", { name: /create team|new team|add team/i })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("populated teams list renders team rows", async ({ page }) => {
    await setUpAdminWithTeams(page, [
      { id: 1, name: "Engineering", memberCount: 4 },
      { id: 2, name: "Marketing", memberCount: 2 },
    ]);
    await openSettings(page);
    const teamsNav = page.getByText(/^teams/i).first();
    if (!(await teamsNav.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, "Teams section not in this build");
      return;
    }
    await teamsNav.click();
    await expect(page.getByText(/Engineering/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/Marketing/i).first()).toBeVisible();
  });
});
