import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { captureViewerPageBitmap } from "@editor/tests/helpers/pdfjsVisualReference";
import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Capture-only walkthrough for the viewer with the ECI Altona corpus. Set
 * ECI_DIR and SHOT_DIR, then run with the stubbed project to write the PNGs
 * consumed by the report.
 */

const SHOT_DIR = process.env.SHOT_DIR;
const ECI_DIR = process.env.ECI_DIR;

function firstExisting(names: string[]): string | null {
  if (!ECI_DIR) return null;
  for (const name of names) {
    const candidate = path.join(ECI_DIR, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const ALTONA_VISUAL = firstExisting([
  "altona_visual_1v2a_x3.pdf",
  "altona-visual-1v2a.pdf",
]);
const ALTONA_TECHNICAL = firstExisting([
  "altona_technical_1v2_x3.pdf",
  "altona-technical-1v2.pdf",
]);
const ALTONA_TECHNICAL_2 = firstExisting([
  "altona2_technical_x4.pdf",
  "altona-technical-2.pdf",
]);

type Theme = "light" | "dark";

async function applyTheme(page: Page, theme: Theme): Promise<void> {
  if (theme === "light") return;
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
    const applyDirection = () => {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar-AR");
    };
    if (document.documentElement) applyDirection();
    else document.addEventListener("DOMContentLoaded", applyDirection);
  });
}

async function openViewer(page: Page, file: string): Promise<void> {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 120_000,
  });
  await waitForPageImage(page, 0);
}

async function waitForPageImage(page: Page, index: number): Promise<void> {
  const element = page.locator(`[data-page-index="${index}"]`).first();
  await element.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        element
          .locator("img")
          .evaluateAll(
            (images) =>
              images.length > 0 &&
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
          ),
      { timeout: 120_000 },
    )
    .toBe(true);
  await element.evaluate(async (node) => {
    const images = Array.from(node.querySelectorAll("img"));
    await Promise.all(images.map((image) => image.decode().catch(() => {})));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
}

async function zoomIn(page: Page, steps: number): Promise<void> {
  const pageElement = page.locator('[data-page-index="0"]').first();
  const before = await pageElement.boundingBox();
  const zoom = page.getByRole("button", { name: "Zoom in" }).first();
  for (let step = 0; step < steps; step++) await zoom.click();
  await expect
    .poll(async () => (await pageElement.boundingBox())?.width ?? 0)
    .toBeGreaterThan((before?.width ?? 0) + 10);
  await waitForPageImage(page, 0);
}

async function fitPage(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  await page.getByRole("menuitem", { name: "Fit to page" }).click();
  await waitForPageImage(page, 0);
}

async function enterFocusMode(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Focus mode" }).first().click();
  await expect(
    page.getByRole("button", { name: "Exit focus mode" }),
  ).toBeVisible();
  await fitPage(page);
}

async function openThumbnails(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
  await expect(
    page.getByRole("button", { name: "Close thumbnails sidebar" }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        page
          .locator(".sidebar-base img")
          .evaluateAll(
            (images) =>
              images.length >= 1 &&
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
          ),
      { timeout: 120_000 },
    )
    .toBe(true);
}

function shotPath(name: string): string {
  if (!SHOT_DIR) throw new Error("SHOT_DIR is not set");
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, `${name}.png`);
}

async function capture(
  page: Page,
  name: string,
  file: string,
  setup?: (page: Page) => Promise<void>,
  detailPage?: number,
): Promise<void> {
  await openViewer(page, file);
  if (setup) await setup(page);
  await page.mouse.move(0, 0);
  await expect(page.locator('[role="tooltip"]')).toHaveCount(0, {
    timeout: 2_000,
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  if (detailPage === undefined) {
    await page.screenshot({ path: shotPath(name) });
  } else {
    const bitmap = await captureViewerPageBitmap(page, detailPage);
    fs.writeFileSync(shotPath(name), bitmap);
  }
}

test.skip(!SHOT_DIR, "set SHOT_DIR to capture the walkthrough");
test.skip(!!process.env.CI, "capture-only spec; not for CI");
test.skip(!ALTONA_VISUAL, "set ECI_DIR to the ECI Altona fixtures");

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ mode: "serial", timeout: 300_000 });

for (const theme of ["light", "dark"] as const) {
  test.describe(`viewer corpus walkthrough (${theme})`, () => {
    for (const view of [
      {
        id: "01_altona_visual",
        title: "ECI Altona 1.2 visual",
        file: ALTONA_VISUAL,
        setup: undefined,
      },
      {
        id: "02_altona_technical",
        title: "ECI Altona 1.2 technical",
        file: ALTONA_TECHNICAL,
        setup: undefined,
      },
      {
        id: "03_altona_technical2",
        title: "ECI Altona 2.0 technical",
        file: ALTONA_TECHNICAL_2,
        setup: undefined,
      },
      {
        id: "04_altona_visual_zoom",
        title: "ECI Altona 1.2 visual at 150%",
        file: ALTONA_VISUAL,
        setup: (page: Page) => zoomIn(page, 3),
      },
      {
        id: "05_altona_visual_rtl",
        title: "ECI Altona 1.2 visual, RTL layout",
        file: ALTONA_VISUAL,
        setup: undefined,
      },
      {
        id: "06_altona_visual_detail",
        title: "ECI Altona 1.2 visual, full page",
        file: ALTONA_VISUAL,
        detailPage: 0,
        setup: undefined,
      },
      {
        id: "07_altona_technical2_detail",
        title: "ECI Altona 2.0 technical, full page",
        file: ALTONA_TECHNICAL_2,
        detailPage: 0,
        setup: undefined,
      },
      {
        id: "08_altona_focus_mode",
        title: "ECI Altona 1.2 visual in focus mode",
        file: ALTONA_VISUAL,
        setup: enterFocusMode,
      },
      {
        id: "09_altona_technical2_fit_page",
        title: "ECI Altona 2.0 technical, fit to page",
        file: ALTONA_TECHNICAL_2,
        setup: fitPage,
      },
      {
        id: "10_altona_thumbnails",
        title: "ECI Altona page thumbnails",
        file: ALTONA_VISUAL,
        setup: openThumbnails,
      },
    ] as Array<{
      id: string;
      title: string;
      file: string | null;
      setup?: (page: Page) => Promise<void>;
      detailPage?: number;
    }>) {
      if (!view.file) continue;
      test(view.id, async ({ page }) => {
        await applyTheme(page, theme);
        if (view.id === "05_altona_visual_rtl") await enableRtl(page);
        await capture(
          page,
          `${view.id}_${theme}`,
          view.file!,
          view.setup,
          view.detailPage,
        );
      });
    }
  });
}
