import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

/**
 * Cross-font charcode disambiguation (H1H2/U).
 *
 * The backend encode-charcodes endpoint now accepts a `fontName` so a page with
 * two fonts rendering the same char encodes against the RIGHT one. This test
 * mocks the endpoint and asserts the frontend reads the run's /BaseFont name
 * (FPDFFont_GetBaseFontName) and sends it - the wiring that makes the backend
 * disambiguation reachable. The backend half is covered by the Java unit test
 * (fontNameDisambiguatesBetweenTwoFontsRenderingTheSameChar).
 */

const SUBSET = path.join(
  import.meta.dirname,
  "../test-fixtures/subset-font-sample.pdf",
);

test("editor sends the run's font name to encode-charcodes", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(90_000);
  const bodies: Array<Record<string, unknown>> = [];
  await page.route("**/encode-charcodes", async (route: Route) => {
    try {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    } catch {
      /* ignore non-JSON */
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ charcodes: [65], missing: [], note: "stub" }),
    });
  });

  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SUBSET);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);

  // Edit a run - the cache-miss prefetch (and focus prewarm) POST to the
  // endpoint, now carrying the resolved font's name.
  const id = await page.evaluate(() => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    return s.doc.page(0).runs[0]?.id ?? null;
  });
  expect(id, "page 0 has a run").toBeTruthy();
  await page.evaluate((rid: string) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="v2-run-${rid}"]`,
    )!;
    el.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, "s");
  }, id as string);
  await page.waitForTimeout(1500);

  expect(bodies.length, "endpoint was called").toBeGreaterThan(0);
  const named = bodies.filter(
    (b) => typeof b.fontName === "string" && (b.fontName as string).length > 0,
  );
  expect(
    named.length,
    `at least one request carries a non-empty fontName; bodies=${JSON.stringify(
      bodies.map((b) => b.fontName),
    )}`,
  ).toBeGreaterThan(0);
});
