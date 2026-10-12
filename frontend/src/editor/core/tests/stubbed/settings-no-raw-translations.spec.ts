import { test, expect } from "@app/tests/helpers/stub-test-base";

test.use({ stubOptions: { enableLogin: true, isAdmin: true }, seedJwt: true });

/**
 * A `t()` call placed as JSX children instead of `{t()}` prints its own source.
 * The key still counts as referenced, so only the rendered page catches it.
 */
const PAGES = [
  "adminGeneral",
  "adminAi",
  "adminSecurity",
  "adminConnections",
  "adminLegal",
  "adminAdvanced",
  "adminDatabase",
  "adminAudit",
  "adminUsage",
  "adminPlan",
  "general",
  "about",
];

for (const key of PAGES) {
  test(`${key} renders no raw translation calls`, async ({ page }) => {
    await page.goto(`/settings/${key}`);
    await expect(page.locator(".settings-page")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);

    // Open every card and accordion: collapsed panels are `hidden`, and
    // innerText skips them, which is how 26 of these hid the first time.
    await page.evaluate(() => {
      document
        .querySelectorAll<HTMLButtonElement>(
          '.settings-card__toggle[aria-expanded="false"], .mantine-Accordion-control[aria-expanded="false"]',
        )
        .forEach((b) => b.click());
    });
    await page.waitForTimeout(600);

    const hits = await page.evaluate(() => {
      const scroll = document.querySelector(".modal-content-scroll");
      const text = (scroll as HTMLElement | null)?.innerText ?? "";
      return [
        ...new Set(
          [...text.matchAll(/t\(\s*["'][^"']+["']/g)].map((m) => m[0]),
        ),
      ];
    });
    expect(hits, `raw t() calls rendered as text on ${key}`).toEqual([]);
  });
}
