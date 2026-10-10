import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({ autoGoto: false });

test("cold load fetches app-config exactly once", async ({ page }) => {
  const configUrls: string[] = [];
  page.on("response", (r) => {
    if (new URL(r.url()).pathname === "/api/v1/config/app-config") {
      configUrls.push(r.url());
    }
  });

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.locator(".workspace-frame").first().waitFor({ state: "visible" });
  // The duplicate is a second request fired after the first resolves, so
  // networkidle alone can precede it. Let the startup chain settle first.
  await expect
    .poll(() => configUrls.length, { timeout: 10000 })
    .toBeGreaterThan(0);

  expect(configUrls).toHaveLength(1);
});
