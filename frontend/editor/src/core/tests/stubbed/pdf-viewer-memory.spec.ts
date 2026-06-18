import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

test.describe("PDF Viewer E2E Memory Leak and DOM Stability Tests", () => {
  test("verify memory and DOM element count do not grow unbounded during active scrolling", async ({
    page,
  }) => {
    await page.goto("/read");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Loading...", { exact: true })).not.toBeVisible(
      {
        timeout: 15_000,
      },
    );

    // 1. Upload sample document
    await page.getByTestId("files-button").click();
    await page
      .locator('[data-testid="file-input"]')
      .first()
      .setInputFiles(SAMPLE_PDF);

    // Wait until file is loaded
    await expect(page.locator(".file-sidebar-file-item").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/\/\s*1/)).toBeVisible({ timeout: 30_000 });

    // Wait for the PDF engine & document ready wrapper to initialize
    await page.waitForFunction(
      () => (window as any).__embedPdfRegistry !== undefined,
      null,
      { timeout: 30_000 },
    );

    // 2. Record baseline values
    const baselineDomNodes = await page.evaluate(
      () => document.getElementsByTagName("*").length,
    );
    console.log(`[MEMORY TEST] Baseline DOM Node Count: ${baselineDomNodes}`);

    const baselineHeap = await page.evaluate(() => {
      const mem = (performance as any).memory;
      return mem ? mem.usedJSHeapSize : null;
    });
    if (baselineHeap) {
      console.log(
        `[MEMORY TEST] Baseline JS Heap Size: ${(baselineHeap / 1024 / 1024).toFixed(2)} MB`,
      );
    }

    // 3. Perform scrolling sequence multiple times
    const pages = page.locator("[data-page-index]");
    const pageCount = await pages.count();
    expect(pageCount).toBeGreaterThan(0);

    for (let scrollCycle = 1; scrollCycle <= 3; scrollCycle++) {
      console.log(`[MEMORY TEST] Scroll Cycle ${scrollCycle}/${3}`);

      // Scroll forward
      for (let i = 0; i < pageCount; i++) {
        await pages.nth(i).scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
      }

      // Scroll backward
      for (let i = pageCount - 1; i >= 0; i--) {
        await pages.nth(i).scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
      }
    }

    // 4. Wait for stabilization
    await page.waitForTimeout(1000);

    // 5. Measure final metrics
    const finalDomNodes = await page.evaluate(
      () => document.getElementsByTagName("*").length,
    );
    console.log(`[MEMORY TEST] Final DOM Node Count: ${finalDomNodes}`);

    const finalHeap = await page.evaluate(() => {
      const mem = (performance as any).memory;
      return mem ? mem.usedJSHeapSize : null;
    });
    if (finalHeap) {
      console.log(
        `[MEMORY TEST] Final JS Heap Size: ${(finalHeap / 1024 / 1024).toFixed(2)} MB`,
      );
    }

    // The stable outer wrapper and Virtualization optimizations should prevent the DOM count from blowing up
    // We expect the final DOM node count to be close to baseline (within a reasonable margin)
    // and definitely below a strict ceiling (e.g. baseline * 1.5).
    const domNodeCeiling = Math.ceil(baselineDomNodes * 1.5);
    console.log(`[MEMORY TEST] DOM Node Ceiling: ${domNodeCeiling}`);
    expect(finalDomNodes).toBeLessThan(domNodeCeiling);

    // If heap performance API is active, check for reasonable heap size
    if (baselineHeap && finalHeap) {
      const heapGrowth = finalHeap - baselineHeap;
      console.log(
        `[MEMORY TEST] JS Heap growth: ${(heapGrowth / 1024 / 1024).toFixed(2)} MB`,
      );
      // Allow some transient JIT compilation and garbage collection lag, but verify no catastrophic growth (e.g. > 50 MB)
      expect(heapGrowth).toBeLessThan(50 * 1024 * 1024);
    }
  });
});
