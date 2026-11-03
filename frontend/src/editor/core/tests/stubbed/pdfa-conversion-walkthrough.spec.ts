import { test, expect } from "@editor/tests/helpers/stub-test-base";
import {
  suppressNativeFilePicker,
  revealPickerTool,
} from "@editor/tests/helpers/ui-helpers";
import type { Page, Route } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/** Walkthrough capture for PDF to PDF/A conversion UX. */

test.skip(!!process.env.CI, "capture-only spec; not for CI");

const SHOT_DIR =
  process.env.SHOT_DIR ??
  path.join(import.meta.dirname, "../../../../screenshots/pdfa-conversion");

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

function shot(name: string): string {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, `${name}.png`);
}

async function settle(page: Page, ms = 700) {
  await page.waitForTimeout(ms);
}

type Theme = "light" | "dark";

async function applyTheme(page: Page, theme: Theme) {
  if (theme !== "dark") return;
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function dismissTourTooltip(page: Page) {
  const closeBtn = page.getByRole("button", { name: /close tooltip/i }).first();
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click();
  }
}

async function uploadFile(page: Page, filePath: string) {
  await page.getByTestId("files-button").click();
  await page.locator('[data-testid="file-input"]').setInputFiles(filePath);
}

async function navigateToPdfa(page: Page) {
  const tile = await revealPickerTool(page, "convert");
  await tile.click();
  await page.waitForSelector('[data-testid="convert-to-dropdown"]', {
    timeout: 5000,
  });
  await page.getByTestId("convert-to-dropdown").click();
  await page.getByTestId("format-option-pdfa").click();
  await page.waitForSelector('[data-testid="pdfa-settings"]', {
    timeout: 5000,
  });
}

test.use({ autoGoto: false });

const THEMES: Theme[] = ["light", "dark"];

for (const theme of THEMES) {
  test(`01_pdfa_default_settings_${theme}`, async ({ page }) => {
    suppressNativeFilePicker(page);
    await applyTheme(page, theme);
    await page.goto("/?bypassOnboarding=true");
    await uploadFile(page, SAMPLE_PDF);
    await navigateToPdfa(page);
    await dismissTourTooltip(page);
    await settle(page, 500);

    await page.screenshot({ path: shot(`01_pdfa_default_settings_${theme}`) });
  });

  test(`02_pdfa_strict_mode_checked_${theme}`, async ({ page }) => {
    suppressNativeFilePicker(page);
    await applyTheme(page, theme);
    await page.goto("/?bypassOnboarding=true");
    await uploadFile(page, SAMPLE_PDF);
    await navigateToPdfa(page);
    await dismissTourTooltip(page);

    const strictToggle = page.getByTestId("pdfa-strict-mode-toggle");
    await strictToggle.click();
    await settle(page, 500);

    await page.screenshot({
      path: shot(`02_pdfa_strict_mode_checked_${theme}`),
    });
  });

  test(`03_pdfa_strict_error_view_${theme}`, async ({ page }) => {
    suppressNativeFilePicker(page);
    await applyTheme(page, theme);

    await page.route("**/api/v1/convert/pdf/pdfa", (route: Route) => {
      route.fulfill({
        status: 400,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "/errors/400",
          title: "Bad Request",
          status: 400,
          detail:
            "Strict PDF/A mode enabled: the output is not perfectly compliant with PDF/A-2b. Details: 2b: PDF/A-ISO 19005-2:2011B with errors",
        }),
      });
    });

    await page.goto("/?bypassOnboarding=true");
    await uploadFile(page, SAMPLE_PDF);
    await navigateToPdfa(page);
    await dismissTourTooltip(page);

    const strictToggle = page.getByTestId("pdfa-strict-mode-toggle");
    await strictToggle.click();
    await page.getByTestId("convert-button").click();

    await expect(page.getByRole("alert").first()).toBeVisible({
      timeout: 5000,
    });
    await settle(page, 800);

    await page.screenshot({ path: shot(`03_pdfa_strict_error_view_${theme}`) });
  });
}
