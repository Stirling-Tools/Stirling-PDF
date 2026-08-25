import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");
const MULTIPAGE_PDF = path.join(FIXTURES_DIR, "annotations_out_of_order.pdf");

const SELECTION_RECTS = ".pdf-selection-layer > div:first-child > div";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      get: () => 10,
      configurable: true,
    });
  });
});

async function loadViewer(
  page: import("@playwright/test").Page,
  pdf: string = SAMPLE_PDF,
) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(pdf);

  const workspaceTab = page.getByRole("tab", { name: "Workspace" });
  if (await workspaceTab.isVisible().catch(() => false)) {
    await workspaceTab.click();
  }

  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });

  await page.waitForTimeout(2_000);

  return firstPage;
}

async function dragSelectAcrossPage(
  page: import("@playwright/test").Page,
  firstPage: import("@playwright/test").Locator,
) {
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");

  const y = box.y + box.height * 0.18;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();
}

function grabCursorCount(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>("div")).filter(
        (el) => el.style.cursor === "grab",
      ).length,
  );
}

test("reports a touchscreen so the regression can actually occur", async ({
  page,
}) => {
  await page.goto("/editor");
  expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(
    0,
  );
});

test("viewer does not start in pan mode on a touchscreen device", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loadViewer(page);
  expect(await grabCursorCount(page)).toBe(0);
});

test("viewer does not start in pan mode when only ontouchstart is exposed", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "maxTouchPoints", {
      get: () => 0,
      configurable: true,
    });
    Object.defineProperty(window, "ontouchstart", {
      value: null,
      configurable: true,
    });
  });

  const firstPage = await loadViewer(page);
  expect(
    await page.evaluate(() => ({
      mtp: navigator.maxTouchPoints,
      ots: "ontouchstart" in window,
    })),
  ).toEqual({ mtp: 0, ots: true });

  expect(await grabCursorCount(page)).toBe(0);

  await dragSelectAcrossPage(page, firstPage);
  await expect(firstPage.locator(SELECTION_RECTS).first()).toBeAttached({
    timeout: 5_000,
  });
});

test("text is selectable on a touchscreen laptop without touching pan", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const firstPage = await loadViewer(page);

  await dragSelectAcrossPage(page, firstPage);

  const selectionRects = firstPage.locator(SELECTION_RECTS);
  await expect(selectionRects.first()).toBeAttached({ timeout: 5_000 });
  expect(await selectionRects.count()).toBeGreaterThan(0);
});

test("hovering text gives an I-beam, not the pan hand", async ({ page }) => {
  test.setTimeout(60_000);
  const firstPage = await loadViewer(page);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");

  await page.mouse.move(box.x + 5, box.y + 5);
  await page.waitForTimeout(100);
  await page.mouse.move(box.x + box.width * 0.21, box.y + box.height * 0.105, {
    steps: 5,
  });
  await page.waitForTimeout(500);

  const cursor = await firstPage.evaluate((el) => {
    const parent = (el as HTMLElement).parentElement;
    return parent ? getComputedStyle(parent).cursor : "no-parent";
  });
  expect(cursor).toMatch(/^(text|vertical-text)$/);
});

test("right-click on a word offers Copy", async ({ page }) => {
  test.setTimeout(60_000);
  const firstPage = await loadViewer(page);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");

  await page.mouse.click(box.x + box.width * 0.21, box.y + box.height * 0.105, {
    button: "right",
  });

  await expect(firstPage.locator(SELECTION_RECTS).first()).toBeAttached({
    timeout: 5_000,
  });
  await expect(page.getByRole("button", { name: "Copy" }).first()).toBeVisible({
    timeout: 5_000,
  });
});

test("pan toggle turns pan on and back off on a touchscreen laptop", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);

  const panButton = page.getByRole("button", { name: "Pan Mode" }).first();
  await expect(panButton).toBeVisible({ timeout: 10_000 });

  expect(await grabCursorCount(page)).toBe(0);

  await panButton.click();
  await expect
    .poll(() => grabCursorCount(page), { timeout: 5_000 })
    .toBeGreaterThan(0);

  await panButton.click();
  await expect.poll(() => grabCursorCount(page), { timeout: 5_000 }).toBe(0);

  await dragSelectAcrossPage(page, firstPage);
  await expect(firstPage.locator(SELECTION_RECTS).first()).toBeAttached({
    timeout: 5_000,
  });
});

test("pan button state is not left stale after switching files", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await loadViewer(page);

  const panButton = page.getByRole("button", { name: "Pan Mode" }).first();
  await panButton.click();
  await expect
    .poll(() => grabCursorCount(page), { timeout: 5_000 })
    .toBeGreaterThan(0);

  await page.locator('input[type="file"]').first().setInputFiles(MULTIPAGE_PDF);

  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 30_000 })
    .toBe(3);
  await page.waitForTimeout(1_000);

  await expect.poll(() => grabCursorCount(page), { timeout: 5_000 }).toBe(0);
  await expect(panButton).not.toHaveAttribute("aria-pressed", "true");

  await panButton.click();
  await expect
    .poll(() => grabCursorCount(page), { timeout: 5_000 })
    .toBeGreaterThan(0);
});

test.describe("touch-primary device", () => {
  test.use({
    viewport: { width: 394, height: 915 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "isMobile emulation and CDP touch injection are chromium-only",
  );

  test("finger can both scroll the document and select text", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);

    const firstPage = await loadViewer(page, MULTIPAGE_PDF);
    expect(await grabCursorCount(page)).toBe(0);

    expect(
      await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>(
          ".pdf-page-pointer-layer",
        );
        return el ? getComputedStyle(el).touchAction : null;
      }),
    ).toBe("pan-y pinch-zoom");

    const cdp = await page.context().newCDPSession(page);
    const touchDrag = async (x: number, y: number, dx: number, dy: number) => {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let i = 1; i <= 12; i++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }],
        });
        await page.waitForTimeout(16);
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(400);
    };

    const scrollTop = () =>
      page.evaluate(() => {
        let el: HTMLElement | null = document.querySelector(
          '[data-page-index="0"]',
        );
        while (el) {
          if (
            el.scrollHeight > el.clientHeight + 5 &&
            /auto|scroll/.test(getComputedStyle(el).overflowY)
          ) {
            (window as unknown as { __sc?: HTMLElement }).__sc = el;
            return el.scrollTop;
          }
          el = el.parentElement;
        }
        return null;
      });
    await scrollTop();
    await page.evaluate(() => {
      const el = (window as unknown as { __sc?: HTMLElement }).__sc;
      if (el) el.scrollTop = 0;
    });
    await page.waitForTimeout(300);

    await expect
      .poll(
        async () => {
          for (const yFraction of [0.11, 0.18, 0.14]) {
            const box = (await firstPage.boundingBox())!;
            await touchDrag(
              box.x + box.width * 0.12,
              box.y + box.height * yFraction,
              box.width * 0.6,
              0,
            );
            const count = await firstPage.locator(SELECTION_RECTS).count();
            if (count > 0) return count;
          }
          return 0;
        },
        { timeout: 45_000 },
      )
      .toBeGreaterThan(0);

    const before = await scrollTop();
    const box = (await firstPage.boundingBox())!;
    await touchDrag(box.x + box.width / 2, box.y + box.height * 0.6, 0, -250);
    const after = await scrollTop();
    expect(after ?? 0).toBeGreaterThan(before ?? 0);
  });
});
