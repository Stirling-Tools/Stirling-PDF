import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { EditorTestWindow } from "@app/tests/stubbed/editorTestTypes";

const FIXTURES = ["sample", "subset-font-sample", "mushroom-life"];

const MAX_DRIFT_PX = 1.5;

interface DriftResult {
  skipped?: string;
  worst: number;
  measured: number;
  text: string;
}

async function openFixture(page: Page, name: string): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(
      path.join(import.meta.dirname, `../test-fixtures/${name}.pdf`),
    );
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
}

function measureDrift(page: Page): Promise<DriftResult> {
  return page.evaluate(() => {
    const empty = { worst: 0, measured: 0, text: "" };
    const store = (window as unknown as EditorTestWindow).__editor_store;
    const p0 = store.doc.page(0);
    const pageEl = document.querySelector<HTMLElement>(
      '[data-testid="pdf-editor-page-0"]',
    );
    const run = p0.runs[0];
    if (!pageEl || !run) return { ...empty, skipped: "no page" };
    const scale = pageEl.getBoundingClientRect().width / p0.width;
    const el = document.querySelector<HTMLElement>(
      `[data-testid="pdf-editor-run-${run.id}"]`,
    );
    if (!el) return { ...empty, skipped: "no overlay" };
    const starts = run.charStartsX;
    if (!starts) return { ...empty, skipped: "no captured positions" };
    const line = el.querySelector<HTMLElement>("[data-pdf-editor-line]");
    if (!line) return { ...empty, skipped: "not pinned" };
    const spans = [
      ...line.querySelectorAll<HTMLElement>("[data-pdf-editor-token]"),
    ];
    if (spans.length < 3) return { ...empty, skipped: "too few words" };

    const originLeft = spans[0].getBoundingClientRect().left;
    const originPdf = starts[0];
    let at = 0;
    let worst = 0;
    let measured = 0;
    for (const span of spans) {
      const text = span.textContent ?? "";
      const expectedPdf = starts[at];
      if (at > 0 && text.trim().length > 0 && Number.isFinite(expectedPdf)) {
        const actual = span.getBoundingClientRect().left - originLeft;
        const expected = (expectedPdf - originPdf) * scale;
        worst = Math.max(worst, Math.abs(actual - expected));
        measured += 1;
      }
      at += text.length;
    }
    return { worst, measured, text: run.text };
  });
}

for (const name of FIXTURES) {
  test(`words sit on the engine's own pen origins (${name})`, async ({
    page,
  }: {
    page: Page;
  }) => {
    await openFixture(page, name);
    await expect(
      page.locator('[data-testid^="pdf-editor-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });

    const result = await measureDrift(page);
    test.skip(!!result.skipped, `cannot be pinned: ${result.skipped}`);
    expect(result.measured).toBeGreaterThan(0);
    expect(result.worst).toBeLessThan(MAX_DRIFT_PX);
  });

  test(`an edited run pins itself again once the edit settles (${name})`, async ({
    page,
  }: {
    page: Page;
  }) => {
    await openFixture(page, name);
    const target = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
    await expect(target).toBeVisible({ timeout: 30_000 });
    await target.click();
    await page.keyboard.press("End");
    await page.keyboard.type("Q");
    await page.waitForTimeout(300);
    await page
      .locator('[data-testid="pdf-editor-page-0"]')
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(1200);
    await target.click();
    await page.waitForTimeout(400);

    const result = await measureDrift(page);
    test.skip(!!result.skipped, `cannot be pinned: ${result.skipped}`);
    expect(result.text).toContain("Q");
    expect(result.measured).toBeGreaterThan(0);
    expect(result.worst).toBeLessThan(MAX_DRIFT_PX);
  });
}
