import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

/** Palette guardrails: category marks stay distinguishable, the accent stays readable as text and as a fill. */
test.use({ autoGoto: false, viewport: { width: 1920, height: 1080 } });

interface PaletteReport {
  sectionColours: string[];
  accentTextOnBg: number;
  onPrimary: number;
  tokens: Record<string, string>;
}

async function readPalette(page: Page): Promise<PaletteReport> {
  return page.evaluate(() => {
    // Resolved by the browser, not by a hex parser: pre-built CSS minifies
    // #ffffff to #fff, and color-mix() never parses as a hex at all.
    const toRgb = (value: string): [number, number, number] => {
      const probe = document.createElement("canvas");
      probe.width = 1;
      probe.height = 1;
      const ctx = probe.getContext("2d");
      if (!ctx) return [0, 0, 0];
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b];
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
      tokens: {
        accentText: token("--c-accent-text"),
        bg: token("--c-bg"),
        onPrimary: token("--c-text-on-primary"),
        primary: token("--c-primary"),
      },
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
  const tokens = JSON.stringify(light.tokens);
  expect(new Set(light.sectionColours).size, tokens).toBeGreaterThanOrEqual(8);
  expect(light.accentTextOnBg, tokens).toBeGreaterThanOrEqual(4.5);
  expect(light.onPrimary, tokens).toBeGreaterThanOrEqual(4.5);
});

test("dark palette keeps the same guarantees", async ({ page }) => {
  await seedDark(page);
  await seedFullscreenPanel(page);
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tool-panel__fullscreen-surface")).toBeVisible();
  await expect(page.locator("[data-wings]")).toHaveCount(0);

  const dark = await readPalette(page);
  const tokens = JSON.stringify(dark.tokens);
  expect(new Set(dark.sectionColours).size, tokens).toBeGreaterThanOrEqual(8);
  expect(dark.accentTextOnBg, tokens).toBeGreaterThanOrEqual(4.5);
  expect(dark.onPrimary, tokens).toBeGreaterThanOrEqual(4.5);
});
