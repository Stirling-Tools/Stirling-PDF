import { test, expect } from "@app/tests/helpers/stub-test-base";

// The en-US fallback covers only keys missing from the active locale, so it must
// not gate first paint; the app fetches it after the active language resolves.
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

  const resolved: string[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/locales/")) {
      resolved.push(r.url());
    }
  });
  // Hold the fallback file until released: the workspace rendering while it is
  // still pending proves paint does not wait for it.
  let releaseFallback!: () => void;
  const fallbackHeld = new Promise<void>((resolve) => {
    releaseFallback = resolve;
  });
  await page.route("**/locales/en-US/translation.toml", async (route) => {
    await fallbackHeld;
    await route.continue();
  });

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.locator(".workspace-frame").first().waitFor({
    state: "visible",
    timeout: 15000,
  });

  expect(
    resolved.some((u) => u.includes("/en-US/")),
    "fallback resolved before paint",
  ).toBe(false);

  releaseFallback();
  const fallbackResponse = await page
    .waitForResponse((r) => r.url().includes("/locales/en-US/"), {
      timeout: 15000,
    })
    .catch(() => null);
  expect(fallbackResponse, "fallback never arrived").not.toBeNull();
});
