import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";

// End-to-end coverage for the fonts panel's client-side glyph-coverage probe.

const SUBSET = path.join(
  import.meta.dirname,
  "../test-fixtures/subset-font-sample.pdf",
);

async function open(page: Page, file: string): Promise<void> {
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
