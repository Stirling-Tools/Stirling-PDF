import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

const SHOTS = path.resolve(process.cwd(), "screenshots", "info-tooltip");
const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

function shot(name: string): string {
  return path.join(SHOTS, `${name}.png`);
}

async function enableDark(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
  await page.emulateMedia({ colorScheme: "dark" });
}

async function enableRtl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "ar-AR");
    localStorage.setItem("i18nextLng-source", "3");
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

async function waitForPopover(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const panel = document.querySelector(".sui-info-panel");
    return panel && getComputedStyle(panel).opacity === "1";
  });
}

async function openToolGuide(page: Page, path = "/compress"): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.locator("button.sui-info").first().click();
  await waitForPopover(page);
}

test.describe("Info tooltip walkthrough", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await uploadFiles(page, SAMPLE);
    await page.goto("/compress", { waitUntil: "domcontentloaded" });
  });

  test("01 tool guide pinned light", async ({ page }) => {
    await openToolGuide(page);
    const panel = page.locator(".sui-info-panel");
    await expect(panel).toBeVisible();
    await page.screenshot({ path: shot("01_tool_guide_pinned_light") });
  });

  test("02 tool guide pinned dark", async ({ page }) => {
    await enableDark(page);
    await openToolGuide(page);
    await page.screenshot({ path: shot("02_tool_guide_pinned_dark") });
  });

  test("03 tool guide hover preview light", async ({ page }) => {
    await page.goto("/compress", { waitUntil: "domcontentloaded" });
    await page.locator("button.sui-info").first().hover();
    await waitForPopover(page);
    await expect(page.locator(".sui-info-panel__close")).toHaveCount(0);
    await page.screenshot({ path: shot("03_tool_guide_hover_light") });
  });

  test("03b tool guide hover preview dark", async ({ page }) => {
    await enableDark(page);
    await page.goto("/compress", { waitUntil: "domcontentloaded" });
    await page.locator("button.sui-info").first().hover();
    await waitForPopover(page);
    await expect(page.locator(".sui-info-panel__close")).toHaveCount(0);
    await page.screenshot({ path: shot("03b_tool_guide_hover_dark") });
  });

  test("04 tool guide pinned rtl", async ({ page }) => {
    await enableRtl(page);
    await openToolGuide(page);
    await page.screenshot({ path: shot("04_tool_guide_pinned_rtl") });
  });

  test("04b tool guide pinned rtl dark", async ({ page }) => {
    await enableRtl(page);
    await enableDark(page);
    await openToolGuide(page);
    await page.screenshot({ path: shot("04b_tool_guide_pinned_rtl_dark") });
  });

  test("05 mobile tool guide", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openToolGuide(page);
    await expect(page.locator(".sui-info-panel")).toBeVisible();
    const overflow = await page.evaluate(() => {
      const panel = document.querySelector(".sui-info-panel");
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        viewport: window.innerWidth,
      };
    });
    expect(overflow).not.toBeNull();
    expect(overflow!.left).toBeGreaterThanOrEqual(0);
    expect(overflow!.right).toBeLessThanOrEqual(overflow!.viewport);
    await page.screenshot({ path: shot("05_tool_guide_mobile_light") });
  });

  test("05b mobile tool guide dark", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enableDark(page);
    await openToolGuide(page);
    await page.screenshot({ path: shot("05b_tool_guide_mobile_dark") });
  });

  test("06 settings field info light", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    const info = page.locator("button.sui-info").first();
    await info.click();
    await waitForPopover(page);
    await page.screenshot({ path: shot("06_settings_field_light") });
  });

  test("07 settings field info dark", async ({ page }) => {
    await enableDark(page);
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    const info = page.locator("button.sui-info").first();
    await info.click();
    await waitForPopover(page);
    await page.screenshot({ path: shot("07_settings_field_dark") });
  });

  test("08 bullets guide light", async ({ page }) => {
    await openToolGuide(page, "/crop");
    await page.screenshot({ path: shot("08_bullets_guide_light") });
  });

  test("09 bullets guide dark", async ({ page }) => {
    await enableDark(page);
    await openToolGuide(page, "/crop");
    await page.screenshot({ path: shot("09_bullets_guide_dark") });
  });

  test("10 bullets guide rtl", async ({ page }) => {
    await enableRtl(page);
    await openToolGuide(page, "/crop");
    await page.screenshot({ path: shot("10_bullets_guide_rtl") });
  });

  test("10b bullets guide rtl dark", async ({ page }) => {
    await enableRtl(page);
    await enableDark(page);
    await openToolGuide(page, "/crop");
    await page.screenshot({ path: shot("10b_bullets_guide_rtl_dark") });
  });

  test("11 bullets guide mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openToolGuide(page, "/crop");
    await page.screenshot({ path: shot("11_bullets_guide_mobile") });
  });

  test("12 bullets guide mobile dark", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enableDark(page);
    await openToolGuide(page, "/crop");
    await page.screenshot({ path: shot("12_bullets_guide_mobile_dark") });
  });
});
