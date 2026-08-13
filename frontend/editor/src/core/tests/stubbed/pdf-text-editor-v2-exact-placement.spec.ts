import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

/** Focusing a run must not slide its words off the glyphs underneath. */
const SAMPLE = path.join(
  import.meta.dirname,
  "../test-fixtures/user-sample.pdf",
);

async function openSample(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 45_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(800);
}

/** Id of the first multi-word run that carries captured positions. */
async function firstMeasuredRun(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (window as unknown as V2TestWindow).__v2_editor_store;
    for (const run of store.doc.page(0).runs) {
      if (!run.charStartsX || run.charPositionsKey === null) continue;
      if (!/\S\s+\S/.test(run.text)) continue;
      // Exact placement is enabled for single-line runs only.
      if ((run.paragraphLineCount ?? 1) > 1) continue;
      return run.id;
    }
    return null;
  });
}

test("the reader captures engine pen positions for page text", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openSample(page);
  const stats = await page.evaluate(() => {
    const store = (window as unknown as V2TestWindow).__v2_editor_store;
    const runs = store.doc.page(0).runs;
    let measured = 0;
    let monotonic = 0;
    for (const r of runs) {
      if (!r.charStartsX || !r.charEndsX) continue;
      measured += 1;
      const xs = r.charStartsX.filter((v) => Number.isFinite(v));
      const ends = r.charEndsX.filter((v) => Number.isFinite(v));
      // Every glyph must advance forward and have a non-negative width.
      const ok =
        xs.length > 0 &&
        ends.length === xs.length &&
        r.charStartsX.every(
          (v, i) => !Number.isFinite(v) || (r.charEndsX as number[])[i] >= v,
        );
      if (ok) monotonic += 1;
    }
    return { total: runs.length, measured, monotonic };
  });
  expect(stats.total).toBeGreaterThan(0);
  expect(stats.measured).toBeGreaterThan(0);
  expect(stats.monotonic).toBe(stats.measured);
});

test("focusing a run places every word on its engine origin", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openSample(page);
  const runId = await firstMeasuredRun(page);
  expect(runId, "a multi-word run with captured positions").toBeTruthy();

  const overlay = page.locator(`[data-testid="v2-run-${runId}"]`);
  await overlay.focus();
  await page.waitForTimeout(150);

  const result = await page.evaluate((rid: string) => {
    const store = (window as unknown as V2TestWindow).__v2_editor_store;
    const run = store.doc.page(0).runs.find((r) => r.id === rid);
    if (!run?.charStartsX) return null;
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="v2-run-${rid}"]`,
    );
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="v2-page-0"] canvas',
    );
    if (!el || !canvas) return null;
    const boxes = [...el.querySelectorAll<HTMLElement>("span[data-exact]")];
    const origin = el.getBoundingClientRect().left;
    // Derive the scale from the rendered page rather than store internals.
    const scale =
      canvas.getBoundingClientRect().width / store.doc.page(0).width;
    // Walk the boxes alongside the text, comparing each word's rendered left
    // edge with the engine origin of its first character.
    const drift: number[] = [];
    let at = 0;
    for (const b of boxes) {
      const text = b.textContent ?? "";
      if (text.trim().length > 0) {
        const expected =
          ((run.charStartsX as number[])[at] - run.bounds.x) * scale;
        const actual = b.getBoundingClientRect().left - origin;
        if (Number.isFinite(expected)) drift.push(Math.abs(actual - expected));
      }
      at += text.length;
    }
    return {
      boxes: boxes.length,
      worstDrift: Math.max(0, ...drift),
      samples: drift.length,
    };
  }, runId as string);

  expect(result).not.toBeNull();
  expect(result?.boxes).toBeGreaterThan(1);
  expect(result?.samples).toBeGreaterThan(1);
  // Sub-pixel: the boxes tile from the captured advances, so nothing drifts.
  expect(result?.worstDrift ?? 99).toBeLessThan(1.5);
});

test("typing flattens the exact boxes and the text still round-trips", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openSample(page);
  const runId = await firstMeasuredRun(page);
  expect(runId).toBeTruthy();

  const overlay = page.locator(`[data-testid="v2-run-${runId}"]`);
  const before = (await overlay.innerText()).replace(/ /g, " ");
  await overlay.focus();
  await page.waitForTimeout(120);
  expect(
    await overlay.locator("span[data-exact]").count(),
    "boxes painted on focus",
  ).toBeGreaterThan(0);

  await page.keyboard.type("Z");
  await page.waitForTimeout(200);
  expect(
    await overlay.locator("span[data-exact]").count(),
    "boxes flattened by the first edit",
  ).toBe(0);

  const after = (await overlay.innerText()).replace(/ /g, " ");
  // Exactly the original text plus the typed character, nothing mangled by
  // the box structure.
  expect(after.replace("Z", "")).toBe(before);
  expect(after).toContain("Z");
});
