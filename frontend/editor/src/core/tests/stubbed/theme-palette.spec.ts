import { test, expect, type Page } from "@app/tests/helpers/stub-test-base";

/**
 * Design guardrails for the catalogue palette: category marks must stay
 * distinguishable from each other, and the accent must stay readable as text
 * and as a fill. Catches the "everything collapsed to one blue" drift.
 */
test.use({ autoGoto: false, viewport: { width: 1920, height: 1080 } });

interface PaletteReport {
  sectionColours: string[];
  accentTextOnBg: number;
  onPrimary: number;
}

async function readPalette(page: Page): Promise<PaletteReport> {
  return page.evaluate(() => {
    const toRgb = (value: string): [number, number, number] => {
      const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
      if (hex) {
        const n = parseInt(hex[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      const nums = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      return [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0];
    };
    const luminance = ([r, g, b]: [number, number, number]): number => {
      const channel = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const contrast = (a: string, b: string): number => {
      const [hi, lo] = [luminance(toRgb(a)), luminance(toRgb(b))].sort(
        (x, y) => y - x,
      );
      return (hi + 0.05) / (lo + 0.05);
    };
    const token = (name: string): string =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    return {
      sectionColours: Array.from(
        document.querySelectorAll(".tool-panel__fullscreen-section-icon"),
      ).map((el) => getComputedStyle(el).color),
      accentTextOnBg: contrast(token("--c-accent-text"), token("--c-bg")),
      onPrimary: contrast(token("--c-text-on-primary"), token("--c-primary")),
    };
  });
}

async function seedDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => {
    localStorage.setItem("mantine-color-scheme", "dark");
    localStorage.setItem("mantine-color-scheme-value", "dark");
  });
}

async function seedFullscreenPanel(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      "stirlingpdf_preferences",
      JSON.stringify({
        defaultToolPanelMode: "fullscreen",
        showLegacyToolDescriptions: true,
        toolPanelModePromptSeen: true,
        hasSelectedToolPanelMode: true,
        hasSeenIntroOnboarding: true,
      }),
    );
  });
}

test("catalogue palette keeps the categories distinguishable and the accent readable", async ({
  page,
}) => {
  await seedFullscreenPanel(page);
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tool-panel__fullscreen-surface")).toBeVisible();
  await expect(page.locator("[data-wings]")).toHaveCount(0);

  const light = await readPalette(page);
  expect(new Set(light.sectionColours).size).toBeGreaterThanOrEqual(8);
  expect(light.accentTextOnBg).toBeGreaterThanOrEqual(4.5);
  expect(light.onPrimary).toBeGreaterThanOrEqual(4.5);
});

test("dark palette keeps the same guarantees", async ({ page }) => {
  await seedDark(page);
  await seedFullscreenPanel(page);
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tool-panel__fullscreen-surface")).toBeVisible();
  await expect(page.locator("[data-wings]")).toHaveCount(0);

  const dark = await readPalette(page);
  expect(new Set(dark.sectionColours).size).toBeGreaterThanOrEqual(8);
  expect(dark.accentTextOnBg).toBeGreaterThanOrEqual(4.5);
  expect(dark.onPrimary).toBeGreaterThanOrEqual(4.5);
});
