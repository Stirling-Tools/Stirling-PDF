import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import path from "path";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");

/** Roughly what the desktop's "make me your default PDF app" banner occupies. */
const BANNER_HEIGHT = 56;

/**
 * Puts a banner above the app the way AppLayout does, and reports whether it landed.
 *
 * Inserted rather than triggered: the real banners are desktop-only, and which of the
 * four shows depends on the machine the app is running on. What matters to the panel
 * is only that something above it took height away.
 */
async function addBanner(
  page: import("@playwright/test").Page,
  height: number,
) {
  return page.evaluate((px) => {
    const shell = Array.from(document.querySelectorAll("div")).find(
      (element) =>
        // #7518 moved the shell to dvh so mobile browser chrome stops clipping
        // the app. Matching 100vh alone finds no shell at all, and the guard
        // below turns that into a failure rather than a silent pass.
        (element.style.height === "100dvh" ||
          element.style.height === "100vh") &&
        element.style.display === "flex" &&
        element.style.flexDirection === "column",
    );
    if (!shell) return false;
    const bar = document.createElement("div");
    bar.setAttribute("data-testid", "test-banner");
    bar.style.cssText = `height:${px}px;flex-shrink:0;`;
    shell.insertBefore(bar, shell.firstChild);
    return true;
  }, height);
}

test.describe("Tool panel", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /**
   * Regression: the panel used to be sized in viewport units while AppLayout shrinks
   * everything below a banner, so the panel hung off the bottom of the window by the
   * banner's height. Since it clips its own overflow, the run button went with it and
   * no amount of scrolling brought it back - the tool simply could not be run.
   */
  test("keeps the run button inside the window when a banner takes height off the top", async ({
    page,
  }) => {
    await page.goto("/cert-sign");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);

    // The tool is a lazy chunk, and this one is large; the default expect timeout is
    // not always enough for it on a cold worker.
    const runButton = page.locator('[data-tour="run-button"]');
    await expect(runButton).toBeVisible({ timeout: 30_000 });

    expect(await addBanner(page, BANNER_HEIGHT)).toBe(true);

    const viewportHeight = page.viewportSize()!.height;

    const panel = await page
      .locator('[data-sidebar="tool-panel"]')
      .boundingBox();
    expect(panel).not.toBeNull();
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewportHeight);

    const button = await runButton.boundingBox();
    expect(button).not.toBeNull();
    expect(button!.y + button!.height).toBeLessThanOrEqual(viewportHeight);
  });
});
