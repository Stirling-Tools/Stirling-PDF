import { expect, type Page } from "@playwright/test";
import { login, skipOnboarding } from "@editor/tests/helpers/login";
import type { AppConfig } from "@editor/types/appConfig";

/** Playwright's request client does not inherit the app's localStorage bearer token. */
export async function liveApiHeaders(
  page: Page,
): Promise<Record<string, string>> {
  if (page.url() === "about:blank") return {};
  const token = await page.evaluate(() => localStorage.getItem("stirling_jwt"));
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Authenticate when required, while supporting local servers with login disabled. */
export async function loadLiveAppConfig(page: Page): Promise<AppConfig> {
  await skipOnboarding(page);
  let response = await page.request.get("/api/v1/config/app-config");
  if (
    response.status() === 401 ||
    (response.ok() && (await response.json()).enableLogin)
  ) {
    await login(page);
    response = await page.request.get("/api/v1/config/app-config", {
      headers: await liveApiHeaders(page),
    });
  }
  expect(response.ok(), `App config returned HTTP ${response.status()}`).toBe(
    true,
  );
  return response.json();
}
