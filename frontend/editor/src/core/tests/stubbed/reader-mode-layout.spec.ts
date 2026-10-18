import { test, expect, type Page } from "@app/tests/helpers/stub-test-base";

/**
 * The fullscreen catalogue is measured from the tool panel's box, and the
 * reader wings slide that box. Measuring mid-slide leaves the surface over the
 * file sidebar and past the viewport's trailing edge.
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
  sidebarRight: number;
  sidebarHit: boolean;
  viewportWidth: number;
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
      sidebarRight: sidebar.right,
      sidebarHit: !!hit && sidebarEl.contains(hit),
      viewportWidth: window.innerWidth,
    };
  });
}

async function wingsSettled(page: Page): Promise<void> {
  await expect(page.locator("[data-wings]")).toHaveCount(0, { timeout: 5_000 });
}

function isSettled(surface: Surface | null, before: Surface | null): boolean {
  if (!surface || !before) return false;
  return (
    Math.abs(surface.left - surface.sidebarRight) < 1 &&
    surface.right <= surface.viewportWidth + 0.5 &&
    Math.abs(surface.left - before.left) < 1 &&
    Math.abs(surface.right - before.right) < 1 &&
    surface.sidebarHit
  );
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
  const before = await readSurface(page);

  // A destination is only negotiable once the previous wings transition has
  // finished; clicking through one strands the shell without the sidebar.
  await rail("Reader").click();
  await expect(page.locator(".reader-rail")).toBeVisible();
  await wingsSettled(page);

  await rail("Editor").click();
  await expect(page.locator(".tool-panel__fullscreen-surface")).toBeVisible();
  await wingsSettled(page);
  // Flush with the sidebar, inside the viewport, same box as before the trip.
  await expect
    .poll(async () => isSettled(await readSurface(page), before), {
      timeout: 5_000,
    })
    .toBe(true);
});
