import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Route } from "@playwright/test";
import path from "path";

/**
 * End-to-end coverage for the fonts panel's client-side glyph-coverage probe.
 *
 * The document loader primes each embedded font's cmap into a cache during its
 * SERIALIZED text-read phase (reading font data at render time corrupts PDFium
 * - that path is deliberately avoided). The panel then reports, per font, which
 * of a-z A-Z 0-9 the font actually has glyphs for, with zero render-time WASM.
 *
 * subset-font-sample.pdf embeds a TrueType subset whose cmap omits most
 * alphanumerics, so the panel must surface concrete "Missing: ..." chars and a
 * yellow summary - all without backend help (encode-charcodes is aborted).
 */

const SUBSET = path.join(__dirname, "../test-fixtures/subset-font-sample.pdf");

async function open(page: any, file: string): Promise<void> {
  await page.route("**/encode-charcodes", (route: Route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1500);
}

test("fonts panel reports concrete a-zA-Z0-9 coverage gaps client-side", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await open(page, SUBSET);

  // The editor must still render (the canvas page) - reading font data at load
  // must not corrupt PDFium.
  await expect(page.getByTestId("v2-page-0")).toBeVisible();

  const panel = page.getByTestId("v2-fonts-panel");
  await expect(panel).toBeVisible();

  // A subset TrueType font with a parseable cmap => concrete missing chars.
  const missing = panel.getByTestId("v2-font-missing").first();
  await expect(missing).toBeVisible();
  await expect(missing).toContainText(/Missing:/);

  // ...and the summary escalates to the yellow "warn" tone accordingly.
  await expect(panel.getByTestId("v2-font-compat")).toHaveAttribute(
    "data-compat",
    "warn",
  );

  expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
});
