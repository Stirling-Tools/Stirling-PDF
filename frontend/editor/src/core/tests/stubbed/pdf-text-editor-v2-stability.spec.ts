import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Clicking text places a caret. It must not move the page, and it must not
// move a single word. Every regression in this area has been something
// shifting at the moment of focus, so this pins the whole class.
const FIXTURES = ["sample", "mushroom-life", "stirling-marketing"];

interface Geometry {
  pageX: number;
  pageY: number;
  words: Array<{ x: number; y: number }>;
}

function readGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const pageEl = document.querySelector<HTMLElement>(
      '[data-testid="v2-page-0"]',
    );
    const rect = pageEl?.getBoundingClientRect();
    const words = [
      ...document.querySelectorAll<HTMLElement>("[data-v2-token]"),
    ].map((s) => {
      const r = s.getBoundingClientRect();
      return { x: +r.left.toFixed(2), y: +r.top.toFixed(2) };
    });
    return {
      pageX: +(rect?.left ?? 0).toFixed(2),
      pageY: +(rect?.top ?? 0).toFixed(2),
      words,
    };
  });
}

for (const fixture of FIXTURES) {
  test(`clicking a run moves nothing (${fixture})`, async ({
    page,
  }: {
    page: Page;
  }) => {
    test.setTimeout(120_000);
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 45_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(
        path.join(import.meta.dirname, `../test-fixtures/${fixture}.pdf`),
      );
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 45_000,
    });
    await page.waitForTimeout(2500);

    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const target = (await runs.count()) > 2 ? runs.nth(2) : runs.first();
    await target.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const before = await readGeometry(page);
    const box = await target.boundingBox();
    expect(box).not.toBeNull();

    // A raw mouse event at a point already on screen: the framework's own
    // click() scrolls the target into view first and would hide a regression.
    await page.mouse.click(
      box!.x + Math.min(30, box!.width / 3),
      box!.y + Math.min(6, box!.height / 2),
    );
    await page.waitForTimeout(900);

    const after = await readGeometry(page);

    expect(Math.abs(after.pageX - before.pageX)).toBeLessThan(0.5);
    expect(Math.abs(after.pageY - before.pageY)).toBeLessThan(0.5);

    const shared = Math.min(before.words.length, after.words.length);
    let worst = 0;
    for (let i = 0; i < shared; i += 1) {
      worst = Math.max(
        worst,
        Math.abs(after.words[i].x - before.words[i].x),
        Math.abs(after.words[i].y - before.words[i].y),
      );
    }
    expect(worst).toBeLessThan(0.5);
  });
}
