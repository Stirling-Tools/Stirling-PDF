import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

/**
 * Guards the fullscreen catalogue's box across the reader wings, RTL and
 * viewport changes: the surface is measured from the tool panel's box, which
 * the wings slide.
 */
test.use({ autoGoto: false });

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

interface Surface {
  left: number;
  right: number;
  width: number;
  sidebarRight: number;
  sidebarHit: boolean;
  viewportWidth: number;
  scrollWidth: number;
}

async function readSurface(page: Page): Promise<Surface | null> {
  return page.evaluate(() => {
    const surfaceEl = document.querySelector(".tool-panel__fullscreen-surface");
    const sidebarEl = document.querySelector(".file-sidebar");
    if (!surfaceEl || !sidebarEl) return null;
    const surface = surfaceEl.getBoundingClientRect();
    const sidebar = sidebarEl.getBoundingClientRect();
    const hit = document.elementFromPoint(
      sidebar.left + sidebar.width / 2,
      sidebar.top + sidebar.height / 2,
    );
    return {
      left: surface.left,
      right: surface.right,
      width: surface.width,
      sidebarRight: sidebar.right,
      sidebarHit: !!hit && sidebarEl.contains(hit),
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

/** Mirrors the app's own RTL switch: language + document direction. */
async function enableRtl(page: Page): Promise<void> {
  await page.addInitScript(() => {
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

async function wingsSettled(page: Page): Promise<void> {
  await expect(page.locator("[data-wings]")).toHaveCount(0);
}

function isSettled(surface: Surface | null, before: Surface | null): boolean {
  if (!surface || !before) return false;
  return (
    touchesSidebar(surface) &&
    Math.abs(surface.left - before.left) < 1 &&
    Math.abs(surface.right - before.right) < 1
  );
}

/** The surface starts at the sidebar's trailing edge and nothing covers the sidebar. */
function touchesSidebar(surface: Surface | null): boolean {
  if (!surface) return false;
  return (
    Math.abs(surface.left - surface.sidebarRight) < 1 &&
    surface.right <= surface.viewportWidth + 0.5 &&
    surface.sidebarHit
  );
}

/** RTL: anchored to the trailing edge, sidebar untouched. */
function isSettledRtl(surface: Surface | null): boolean {
  if (!surface) return false;
  return (
    Math.abs(surface.right - surface.viewportWidth) < 1 &&
    surface.width >= 360 &&
    surface.sidebarHit &&
    surface.scrollWidth <= surface.viewportWidth
  );
}

function isSettledAtWidth(surface: Surface | null, width: number): boolean {
  if (!surface) return false;
  return touchesSidebar(surface) && Math.abs(surface.right - width) < 1;
}

test("fullscreen tool catalogue keeps its box across reader wings", async ({
  page,
}) => {
  await seedFullscreenPanel(page);
  const nav = page.getByRole("navigation", { name: /Quick navigation/i });
  const rail = (name: string) => nav.getByRole("button", { name, exact: true });

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tool-panel__fullscreen-surface")).toBeVisible();
  await wingsSettled(page);
  // WebKit paints the first box before the sidebar finishes laying out; the
  // baseline is the settled one.
  await expect
    .poll(async () => touchesSidebar(await readSurface(page)))
    .toBe(true);
  const before = await readSurface(page);

  // Wait for the wings to settle: a click mid-slide leaves the shell without
  // its sidebar.
  await rail("Reader").click();
  await expect(page.locator(".reader-rail")).toBeVisible();
  await wingsSettled(page);

  await rail("Editor").click();
  await expect(page.locator(".tool-panel__fullscreen-surface")).toBeVisible();
  await wingsSettled(page);
  // Flush with the sidebar, inside the viewport, same box as before the trip.
  await expect
    .poll(async () => isSettled(await readSurface(page), before))
    .toBe(true);
});

test("fullscreen catalogue anchors to the trailing edge in RTL", async ({
  page,
}) => {
  await enableRtl(page);
  await seedFullscreenPanel(page);

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tool-panel__fullscreen-surface")).toBeVisible();
  await wingsSettled(page);
  await expect
    .poll(async () => isSettledRtl(await readSurface(page)))
    .toBe(true);
});

test("fullscreen catalogue re-measures when the viewport changes", async ({
  page,
}) => {
  await seedFullscreenPanel(page);

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".tool-panel__fullscreen-surface")).toBeVisible();
  await wingsSettled(page);

  const narrow = { width: 1400, height: 900 };
  await page.setViewportSize(narrow);
  await expect
    .poll(async () => isSettledAtWidth(await readSurface(page), narrow.width))
    .toBe(true);
});
