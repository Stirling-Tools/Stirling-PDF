import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

const SELECTION_RECTS = ".pdf-selection-layer > div:first-child > div";

async function loadViewer(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);

  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });
  await page.waitForTimeout(2_000);

  return firstPage;
}

function viewerMode(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const scope = document.querySelector<HTMLElement>(
      "[data-viewer-touch-scroll]",
    );
    const pageEl = document.querySelector<HTMLElement>('[data-page-index="0"]');
    return {
      touchScroll: scope?.getAttribute("data-viewer-touch-scroll") ?? null,
      cursor: pageEl?.parentElement
        ? getComputedStyle(pageEl.parentElement).cursor
        : null,
    };
  });
}

test("exiting redaction restores text selection", async ({ page }) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);

  expect(await viewerMode(page)).toEqual({
    touchScroll: "on",
    cursor: "auto",
  });

  const redactButton = page.getByRole("button", { name: /redact/i }).first();
  await expect(redactButton).toBeVisible({ timeout: 10_000 });
  await redactButton.click();

  await expect
    .poll(async () => (await viewerMode(page)).cursor, { timeout: 15_000 })
    .toBe("crosshair");
  expect((await viewerMode(page)).touchScroll).toBe("off");

  const exitButton = page
    .getByRole("button", { name: /exit redaction mode/i })
    .first();
  if (await exitButton.isVisible().catch(() => false)) {
    await exitButton.click();
  } else {
    await redactButton.click();
  }

  await expect
    .poll(async () => (await viewerMode(page)).touchScroll, { timeout: 15_000 })
    .toBe("on");
  expect((await viewerMode(page)).cursor).toBe("auto");

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");
  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();

  await expect(firstPage.locator(SELECTION_RECTS).first()).toBeAttached({
    timeout: 5_000,
  });
});
