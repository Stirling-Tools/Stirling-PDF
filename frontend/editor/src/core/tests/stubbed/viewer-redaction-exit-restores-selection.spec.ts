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

function grabCursorCount(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>("div")).filter(
        (el) => el.style.cursor === "grab",
      ).length,
  );
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

test("exiting redaction leaves an active pan mode alone", async ({ page }) => {
  test.setTimeout(120_000);
  await loadViewer(page);

  const panButton = page.getByRole("button", { name: "Pan Mode" }).first();
  await expect(panButton).toBeVisible({ timeout: 10_000 });

  const redactButton = page.getByRole("button", { name: /redact/i }).first();
  await expect(redactButton).toBeVisible({ timeout: 10_000 });
  await redactButton.click();

  await expect
    .poll(async () => (await viewerMode(page)).cursor, { timeout: 15_000 })
    .toBe("crosshair");

  await panButton.click();
  await expect
    .poll(() => grabCursorCount(page), { timeout: 5_000 })
    .toBeGreaterThan(0);

  const exitButton = page
    .getByRole("button", { name: /exit redaction mode/i })
    .first();
  await expect(exitButton).toBeVisible({ timeout: 10_000 });
  await exitButton.click();

  // endRedact() is a bare activateDefaultMode(), and pan's defaultMode is
  // "never": leaving redaction must not silently cancel pan (#7678).
  await page.waitForTimeout(1_500);
  expect(await grabCursorCount(page)).toBeGreaterThan(0);
});

test("switching the redact tool back to automatic leaves redaction mode", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await loadViewer(page);

  const redactButton = page.getByRole("button", { name: /redact/i }).first();
  await expect(redactButton).toBeVisible({ timeout: 10_000 });
  await redactButton.click();

  await expect
    .poll(async () => (await viewerMode(page)).cursor, { timeout: 15_000 })
    .toBe("crosshair");

  // The panel is lazy: the mode selector appears once the tool has loaded.
  const automatic = page.getByText("Automatic", { exact: true }).first();
  await expect(automatic).toBeVisible({ timeout: 20_000 });
  await automatic.click();

  await expect
    .poll(async () => (await viewerMode(page)).touchScroll, { timeout: 10_000 })
    .toBe("on");
});

test("redacting from the text selection menu queues a pending redaction", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const firstPage = await loadViewer(page);

  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");
  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();

  const redactInMenu = page
    .locator('[data-text-selection-menu] button[aria-label="Redact"]')
    .first();
  await expect(redactInMenu).toBeVisible({ timeout: 5_000 });
  await redactInMenu.click();

  // The plugin mirrors REDACT annotations into its pending state, so the mark
  // is immediately actionable rather than only drawable.
  await expect(page.getByText(/Apply Redactions/).first()).toBeVisible({
    timeout: 10_000,
  });
});
