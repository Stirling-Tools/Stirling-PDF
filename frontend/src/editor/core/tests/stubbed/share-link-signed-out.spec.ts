import fs from "node:fs";
import path from "node:path";
import type { Page, Route } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const admin = {
  id: 1,
  username: "admin",
  role: "ROLE_ADMIN",
  portalAccess: true,
};
const TOKEN = "00dcac3a-fc7a-4989-9c4f-97745484d62f";
const FILE_NAME = "Shared Report.pdf";
const PDF = fs.readFileSync(
  path.resolve("src/editor/core/tests/test-fixtures/user-sample.pdf"),
);

test.use({
  autoGoto: false,
  stubOptions: { enableLogin: true, isAdmin: true, user: admin },
});

const hasAuth = (route: Route) =>
  Boolean(route.request().headers()["authorization"]);

async function stubShareLink(page: Page, publicLink: boolean): Promise<void> {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.route("**/api/v1/proprietary/ui-data/login", (route) =>
    route.fulfill({ json: { enableLogin: true, loginMethod: "normal" } }),
  );
  await page.route(
    /\/api\/v1\/storage\/share-links\/[^/]+\/metadata/,
    (route) => {
      if (!publicLink && !hasAuth(route)) {
        return route.fulfill({ status: 401, json: {} });
      }
      return route.fulfill({
        json: {
          shareToken: TOKEN,
          fileName: FILE_NAME,
          accessRole: "editor",
          createdAt: "2026-11-02T09:15:00Z",
        },
      });
    },
  );
  await page.route(
    /\/api\/v1\/storage\/share-links\/[^/?]+(\?.*)?$/,
    (route) => {
      if (!publicLink && !hasAuth(route)) {
        return route.fulfill({ status: 401, json: {} });
      }
      return route.fulfill({
        status: 200,
        body: PDF,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${FILE_NAME}"`,
        },
      });
    },
  );
}

test.beforeEach(async ({ context }) => {
  await context.route("**/api/v1/**", (route) => route.fulfill({ json: {} }));
});

test("a public link opens signed out and downloads without signing in", async ({
  page,
}) => {
  await stubShareLink(page, true);
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );

  await page.goto(`/share/${TOKEN}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText(FILE_NAME, { exact: true })).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === `/share/${TOKEN}`);
  await expect(page.getByText(/^Owner:/)).toHaveCount(0);
  await page.getByRole("button", { name: "Download" }).click();
  await expect.poll(() => downloads).toEqual([FILE_NAME]);
  await expect(page).toHaveURL((url) => url.pathname === `/share/${TOKEN}`);
});

test("a private link signed out still goes to sign-in", async ({ page }) => {
  await stubShareLink(page, false);

  await page.goto(`/share/${TOKEN}`, { waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/login" &&
      url.searchParams.get("from") === `/share/${TOKEN}`,
  );
  await expect(page.getByText(FILE_NAME, { exact: true })).toHaveCount(0);
});
