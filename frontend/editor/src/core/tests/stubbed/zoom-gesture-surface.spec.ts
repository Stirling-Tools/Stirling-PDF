import path from "node:path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES, "sample.pdf");

/**
 * Safari fires `gesturestart` for trackpad/touch pinches and magnifies the page
 * unless it is prevented. The viewer handles the gesture itself, but that
 * suppression must not apply to the rest of the app: browser magnification is
 * the only zoom there.
 */
async function loadViewer(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  await page.locator('[data-page-index="0"]').first().waitFor();
  await page.waitForTimeout(1_500);
}

function dispatchGestureStart(
  page: import("@playwright/test").Page,
  selector: string,
) {
  return page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) throw new Error(`missing ${sel}`);
    const event = new Event("gesturestart", {
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }, selector);
}

async function pinch(
  page: import("@playwright/test").Page,
  x: number,
  y: number,
) {
  const cdp = await page.context().newCDPSession(page);
  const points = (spread: number) => [
    { x: x - spread, y },
    { x: x + spread, y },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(20),
  });
  for (const spread of [40, 60, 80]) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(spread),
    });
    await page.waitForTimeout(50);
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(300);
  return page.evaluate(() => window.visualViewport?.scale ?? 1);
}

test.describe("touch pinch", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("browser magnification applies outside the viewer and not inside it", async ({
    page,
    browserName,
  }) => {
    // Mobile emulation (isMobile) is unsupported in Firefox and the touch
    // pinch below drives CDP input events, so this only runs on Chromium.
    test.skip(
      browserName !== "chromium",
      "touch pinch needs isMobile and CDP input, both chromium-only",
    );
    await loadViewer(page);

    const outside = await pinch(page, 120, 400);
    expect(
      outside,
      "pinching the app chrome must magnify the page",
    ).toBeGreaterThan(1);

    await page.reload();
    await loadViewer(page);
    const inside = await pinch(page, 960, 500);
    expect(inside, "pinching a page must not magnify the browser chrome").toBe(
      1,
    );
  });
});

test("viewer suppresses Safari's native pinch magnification only on its own surface", async ({
  page,
}) => {
  await loadViewer(page);

  const outsidePrevented = await dispatchGestureStart(
    page,
    ".file-sidebar-section-header",
  );
  const insidePrevented = await dispatchGestureStart(
    page,
    "[data-page-index='0']",
  );

  expect(
    outsidePrevented,
    "a pinch outside the viewer must reach the browser so the page can magnify",
  ).toBe(false);
  expect(
    insidePrevented,
    "a pinch on a page must stay with the viewer's own zoom handling",
  ).toBe(true);
});
