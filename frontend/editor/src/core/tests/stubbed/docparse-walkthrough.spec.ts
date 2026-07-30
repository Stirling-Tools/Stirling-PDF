import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "node:path";

/** DocParse walkthrough: the five workbench tools.
 * Dumps PNGs to screenshots/docparse; light + dark per view, RTL spot checks. */

const SCREENSHOTS_DIR = path.resolve(process.cwd(), "screenshots", "docparse");

function shotPath(name: string): string {
  return path.join(SCREENSHOTS_DIR, `${name}.png`);
}

async function settle(page: Page, ms = 400): Promise<void> {
  await page.waitForTimeout(ms);
}

async function stubApis(page: Page): Promise<void> {
  // Narrow fallbacks only: a blanket /api/v1/** would out-rank the stub
  // fixture's own /auth/me route (last-registered wins) and break the session.
  await page.route("**/api/v1/policies/**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/proprietary/ui-data/**", (route: Route) =>
    route.fulfill({ json: [] }),
  );
  // enableLogin true: the portal only builds a session when login mode is on
  // (matches live behavior; with login off the portal shows its login screen).
  const configPayload = {
    appVersion: "test",
    enableLogin: true,
    isAdmin: true,
    languages: ["en-US"],
    defaultLocale: "en-US",
    aiEngineEnabled: true,
    docparseEnabled: true,
    docparseAdvanced: true,
    storageEnabled: false,
    premiumEnabled: true,
    runningProOrHigher: true,
  };
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({ json: configPayload }),
  );
  // The auth layer decides login mode from public-config; keep it in sync.
  await page.route("**/api/v1/config/public-config", (route: Route) =>
    route.fulfill({
      json: { enableLogin: true, languages: ["en-US"], defaultLocale: "en-US" },
    }),
  );
  await page.route(
    "**/api/v1/config/endpoints-availability**",
    (route: Route) => route.fulfill({ json: {} }),
  );
  await page.route("**/api/v1/config/endpoint-enabled**", (route: Route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  // DocparseToolIntro probes live capabilities for its tier badges.
  await page.route("**/api/v1/docparse/capabilities", (route: Route) =>
    route.fulfill({
      json: {
        enabled: true,
        mode: "auto",
        advancedInstalled: true,
        engineReachable: true,
        doclingVersion: "2.116.0",
      },
    }),
  );
}

async function enableDarkMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function enableRtl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "ar-AR");
    localStorage.setItem("stirling-language", "ar-AR");
    localStorage.setItem("stirling-language-source", "user");
    const applyDir = () => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar-AR");
    };
    if (document.documentElement) applyDir();
    else document.addEventListener("DOMContentLoaded", applyDir);
  });
}

const TOOLS = [
  { id: "parseDocument", url: "/parse-document", waitText: /Parse/i },
  { id: "extractFields", url: "/extract-fields", waitText: /Extract/i },
  { id: "smartSplit", url: "/smart-split", waitText: /Split/i },
  { id: "chunkDocument", url: "/chunk-document", waitText: /Chunk/i },
  { id: "fillTemplate", url: "/fill-template", waitText: /Template|Fill/i },
];

async function openTool(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body").first()).not.toBeEmpty();
  // The tool panel is the left rail; give lazy chunks a moment.
  await settle(page, 900);
}

test.describe("DocParse walkthrough", () => {
  test.use({
    autoGoto: false,
    viewport: { width: 1600, height: 900 },
    seedJwt: true,
  });

  // ─── Editor tools, light ──────────────────────────────────────────────────
  for (const [i, tool] of TOOLS.entries()) {
    test(`t${i}_${tool.id}_light`, async ({ page }) => {
      await stubApis(page);
      await openTool(page, tool.url);
      await page.screenshot({ path: shotPath(`0${i + 1}_${tool.id}_light`) });
    });

    test(`t${i}_${tool.id}_dark`, async ({ page }) => {
      await enableDarkMode(page);
      await stubApis(page);
      await openTool(page, tool.url);
      await page.screenshot({ path: shotPath(`0${i + 1}_${tool.id}_dark`) });
    });
  }

  // ─── Extract Fields with builder rows filled ─────────────────────────────
  for (const theme of ["light", "dark"] as const) {
    test(`extract_fields_populated_${theme}`, async ({ page }) => {
      if (theme === "dark") await enableDarkMode(page);
      await stubApis(page);
      await openTool(page, "/extract-fields");
      // Fill the first schema-builder row when present; tolerate layout drift.
      const nameInput = page.getByPlaceholder(/name/i).first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("invoice_number");
        const addButton = page.getByRole("button", { name: /add/i }).first();
        if (await addButton.isVisible().catch(() => false)) {
          await addButton.click();
          const second = page.getByPlaceholder(/name/i).nth(1);
          if (await second.isVisible().catch(() => false)) {
            await second.fill("total_due");
          }
        }
      }
      await settle(page);
      await page.screenshot({
        path: shotPath(`06_extract_fields_populated_${theme}`),
      });
    });
  }

  // ─── RTL spot checks ──────────────────────────────────────────────────────
  test("rtl_extract_fields", async ({ page }) => {
    await enableRtl(page);
    await stubApis(page);
    await openTool(page, "/extract-fields");
    await page.screenshot({ path: shotPath("11_extract_fields_rtl") });
  });
});
