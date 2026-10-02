import * as fs from "node:fs";
import * as path from "node:path";
import { test as setup, expect } from "@playwright/test";
import { STATE_FILE, hasTestAccount } from "@app/tests/saas-live/saasLive";

/**
 * Signs the v3 test account in through the real SaaS login page and saves the browser state for
 * the signed-in specs. Without SAAS_E2E_EMAIL and SAAS_E2E_PASSWORD it saves an empty state, and
 * every spec that needs an account skips rather than fails.
 */
setup("sign in the SaaS test account", async ({ page }) => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  if (!hasTestAccount()) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));
    setup.info().annotations.push({
      type: "saas-live",
      description:
        "No SAAS_E2E_EMAIL / SAAS_E2E_PASSWORD: signed-in specs will skip",
    });
    return;
  }

  await page.goto("login", { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(process.env.SAAS_E2E_EMAIL ?? "");
  await page.locator("#password").fill(process.env.SAAS_E2E_PASSWORD ?? "");
  await page.locator('form button[type="submit"]').click();

  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Object.keys(localStorage).some((key) =>
            /^sb-.+-auth-token$/.test(key),
          ),
        ),
      { timeout: 20_000, message: "Supabase session never reached storage" },
    )
    .toBe(true);
  await page.context().storageState({ path: STATE_FILE });
});
