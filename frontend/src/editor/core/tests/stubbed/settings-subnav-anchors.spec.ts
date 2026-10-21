import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({ stubOptions: { enableLogin: true, isAdmin: true }, seedJwt: true });

const SUBNAV = ".settings-page__subnav-item";
const ACTIVE = `${SUBNAV}[aria-current="true"]`;

async function openSystem(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/settings/adminGeneral");
  await expect(page.locator(".settings-page")).toBeVisible({ timeout: 30_000 });
  await page.locator(".settings-card").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1400);
}

test("sub-headings are real #slug anchors", async ({ page }) => {
  await openSystem(page);
  const hrefs = await page
    .locator(SUBNAV)
    .evaluateAll((els) => els.map((a) => a.getAttribute("href")));
  expect(hrefs.length).toBeGreaterThan(1);
  for (const href of hrefs) expect(href).toMatch(/^#[\w-]+$/);
});

test("the slug follows the reader down the page", async ({ page }) => {
  await openSystem(page);
  const top = await page.locator(ACTIVE).textContent();

  await page.evaluate(() => {
    const s = document.querySelector(".modal-content-scroll") as HTMLElement;
    s.scrollTop = s.scrollHeight;
  });
  await page.waitForTimeout(900);

  const bottom = await page.locator(ACTIVE).textContent();
  expect(bottom).not.toBe(top);
  // The URL names what is on screen, so the address can be shared as-is.
  const hash = await page.evaluate(() => window.location.hash);
  expect(hash).not.toBe("");
});

test("clicking a sub-heading wins over the scroll spy", async ({ page }) => {
  await openSystem(page);
  const target = page.locator(SUBNAV).nth(2);
  const href = await target.getAttribute("href");
  await target.click();
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => window.location.hash)).toBe(href);
});

test("the settings nav has no back control", async ({ page }) => {
  await openSystem(page);
  await expect(page.locator('[data-testid="settings-back"]')).toHaveCount(0);
});
