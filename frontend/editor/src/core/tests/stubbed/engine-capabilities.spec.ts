/** Runs on all three engines in PR CI, asserting on evidence that can only exist
 *  if the engine did the work. Keep small - it is paid for three times per PR. */

import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { dismissTourTooltip, uploadFiles } from "@app/tests/helpers/ui-helpers";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");
const PDF_A = path.join(FIXTURES_DIR, "compare_sample_a.pdf");
const PDF_B = path.join(FIXTURES_DIR, "compare_sample_b.pdf");

/** A missing global or prototype method always surfaces as one of these.
 *  Matching the shape keeps benign engine noise out (console-clean.spec.ts). */
const MISSING_API_ERROR =
  /is not a function|is not a constructor|undefined is not an object|has no method/i;

/** Collect the "this engine lacks an API we used" errors seen on the page. */
function recordMissingApiErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => {
    const text = String(error);
    if (MISSING_API_ERROR.test(text)) errors.push(text);
  });
  return errors;
}

async function fillCompareSlot(
  page: Page,
  role: "base" | "comparison",
  filePath: string,
) {
  await page
    .getByTestId(`compare-slot-${role}-add-input`)
    .setInputFiles(filePath);
  await expect(
    page.locator(`[data-testid="compare-slot-${role}"]`),
  ).toHaveAttribute("data-slot-state", "filled", { timeout: 20_000 });
  // The upload modal's overlay outlives its close transition and eats clicks.
  await page
    .locator(".mantine-Modal-overlay")
    .waitFor({ state: "detached", timeout: 5_000 })
    .catch(() => {
      /* already gone */
    });
}

test.describe("engine capabilities", { tag: "@engine-capability" }, () => {
  test("extracts PDF text and completes a comparison", async ({ page }) => {
    test.setTimeout(120_000);
    const missingApis = recordMissingApiErrors(page);

    await page.locator('[data-tour="tool-button-compare"]').first().click();
    await page.waitForSelector('[data-testid="compare-slot-base"]', {
      timeout: 20_000,
    });

    await fillCompareSlot(page, "base", PDF_A);
    await fillCompareSlot(page, "comparison", PDF_B);

    // By test id: `name` matches as a substring, so "Compare" also hits the
    // tool button that opened this panel.
    await page.getByTestId("compare-execute").click();

    // Counted results, not headings: an extraction returning nothing still
    // renders empty panes, which is how the WebKit failure looked like success.
    const deletions = page.getByText(/Deletions \((\d+)\)/);
    const additions = page.getByText(/Additions \((\d+)\)/);
    await expect(deletions).toBeVisible({ timeout: 60_000 });
    await expect(additions).toBeVisible();
    expect(await deletions.innerText()).not.toMatch(/\(0\)/);
    expect(await additions.innerText()).not.toMatch(/\(0\)/);

    expect(missingApis, "no missing-API errors during comparison").toEqual([]);
  });

  test("rasterises page thumbnails via the PDF engine", async ({ page }) => {
    test.setTimeout(120_000);
    const missingApis = recordMissingApiErrors(page);

    await uploadFiles(page, SAMPLE_PDF);
    await dismissTourTooltip(page);

    // A page thumbnail only exists if the WASM engine loaded, rendered and
    // encoded. When it fails the grid still renders, just with no <img>.
    await page.getByText("PDF Multi Tool", { exact: true }).first().click();

    const thumbnail = page
      .locator("[data-page-id] img[data-original-rotation]")
      .first();
    await expect(thumbnail).toBeVisible({ timeout: 60_000 });

    // An empty encode still yields a src; require enough payload to be real.
    const src = await thumbnail.getAttribute("src");
    expect(src ?? "").toMatch(/^data:image\//);
    expect(src?.length ?? 0).toBeGreaterThan(1_000);

    expect(missingApis, "no missing-API errors during thumbnailing").toEqual(
      [],
    );
  });

  test("reads a stored file's bytes back after a reload", async ({ page }) => {
    test.setTimeout(120_000);
    const missingApis = recordMissingApiErrors(page);

    await uploadFiles(page, SAMPLE_PDF);

    // Full reload: FileContext rehydrates from IndexedDB, not from memory.
    await page.reload({ waitUntil: "domcontentloaded" });

    const restored = page.locator(".file-sidebar-file-item").first();
    await expect(restored).toBeVisible({ timeout: 30_000 });

    // Rendering it is the assertion that matters: the metadata record survives
    // even when the bytes were never stored, so a filename proves nothing.
    await restored.hover();
    await restored
      .locator(".file-sidebar-eye-btn")
      .click({ timeout: 15_000, force: true });

    const firstPage = page.locator('[data-page-index="0"]').first();
    await expect(firstPage).toBeVisible({ timeout: 60_000 });

    // A tile that decoded has non-zero naturalWidth. A blob stored but not
    // readable back resolves to nothing, and renders as an empty page.
    const tile = firstPage.locator('img[src^="blob:"]').first();
    await expect(tile).toBeAttached({ timeout: 30_000 });
    await expect
      .poll(() => tile.evaluate((img: HTMLImageElement) => img.naturalWidth), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);

    expect(missingApis, "no missing-API errors after rehydration").toEqual([]);
  });
});
