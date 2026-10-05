import { test, expect } from "@app/tests/helpers/stub-test-base";

// The en-US fallback only covers keys missing from the active locale, so it
// must not gate first paint: i18next loads fallbackLng resources at init and
// suspense waits for all of them. The app fetches it in the background after
// the active language resolves instead.
test.use({
  autoGoto: false,
  stubOptions: { languages: ["de-DE", "en-US"], defaultLocale: "de-DE" },
});

test("non-English cold load paints before the fallback language arrives", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "de-DE");
  });

  const t0 = Date.now();
  const resolved: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/locales/")) {
      resolved.push(r.url());
    }
  });
  // Hold the fallback file: any eager fetch of it blocks paint.
  await page.route("**/locales/en-US/translation.toml", async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    await route.continue();
  });

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.locator(".workspace-frame").first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  const paintAt = Date.now() - t0;

  expect(
    resolved.some((u) => u.includes("/en-US/")),
    "fallback resolved before paint",
  ).toBe(false);
  expect(paintAt).toBeLessThan(5000);

  // ...and the fallback still arrives in the background afterwards.
  await page
    .waitForResponse((r) => r.url().includes("/locales/en-US/"), {
      timeout: 15000,
    })
    .catch(() => null);
  expect(resolved.some((u) => u.includes("/en-US/"))).toBe(true);
});
