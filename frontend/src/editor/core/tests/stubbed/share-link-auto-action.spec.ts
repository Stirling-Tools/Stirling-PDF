import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const admin = {
  id: 1,
  username: "admin",
  role: "ROLE_ADMIN",
  portalAccess: true,
};
const TOKEN = "share-token";
const FILE_NAME = "Shared Report.pdf";
const PDF = fs.readFileSync(
  path.resolve("src/editor/core/tests/test-fixtures/user-sample.pdf"),
);

test.use({
  autoGoto: false,
  seedJwt: true,
  stubOptions: { enableLogin: true, isAdmin: true, user: admin },
});

let downloadRequests = 0;

test.beforeEach(async ({ page, context }) => {
  downloadRequests = 0;
  await context.route("**/api/v1/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ json: { user: admin } }),
  );
  await page.route("**/api/v1/proprietary/ui-data/login", (route) =>
    route.fulfill({ json: { enableLogin: true, loginMethod: "normal" } }),
  );
  await page.route("**/api/v1/proprietary/ui-data/account", (route) =>
    route.fulfill({
      json: { ...admin, settings: "{}", changeCredsFlag: false },
    }),
  );
  await page.route(
    /\/api\/v1\/storage\/share-links\/[^/]+\/metadata/,
    (route) =>
      route.fulfill({
        json: {
          fileName: FILE_NAME,
          owner: "owner@example.com",
          accessRole: "editor",
          createdAt: "2026-11-02T09:15:00Z",
        },
      }),
  );
  await page.route(
    /\/api\/v1\/storage\/share-links\/[^/?]+(\?.*)?$/,
    (route) => {
      downloadRequests += 1;
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
});

test("?action=download runs once and is removed from the URL", async ({
  page,
}) => {
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );

  await page.goto(`/share/${TOKEN}?action=download&ref=chat#card`, {
    waitUntil: "domcontentloaded",
  });
  await expect.poll(() => downloads).toEqual([FILE_NAME]);
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === `/share/${TOKEN}` &&
      url.search === "?ref=chat" &&
      url.hash === "#card",
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(FILE_NAME, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download" })).toBeEnabled();
  await page.getByRole("button", { name: "Download" }).click();
  await expect.poll(() => downloads).toEqual([FILE_NAME, FILE_NAME]);
  expect(downloadRequests).toBe(2);
});

test("?action=open is removed from the URL when opening fails", async ({
  page,
}) => {
  await page.route(
    /\/api\/v1\/storage\/share-links\/[^/?]+(\?.*)?$/,
    (route) => {
      downloadRequests += 1;
      return route.fulfill({ status: 500, json: {} });
    },
  );

  await page.goto(`/share/${TOKEN}?action=open&ref=chat`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByText("Unable to open shared file.")).toBeVisible();
  await expect(page).toHaveURL(
    (url) => url.pathname === `/share/${TOKEN}` && url.search === "?ref=chat",
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(FILE_NAME, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open in Stirling PDF" }),
  ).toBeEnabled();
  expect(downloadRequests).toBe(1);
});
