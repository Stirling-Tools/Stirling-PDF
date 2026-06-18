import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

test.describe("PDF Viewer Hot Paths Performance Benchmark", () => {
  test("measure and profile render formats, load times, and search speeds", async ({
    page,
  }) => {
    // Forward console logs from browser
    page.on("console", (msg) => {
      if (msg.text().includes("[BENCHMARK]")) {
        console.log(msg.text());
      }
    });

    await page.goto("/read");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Loading...", { exact: true })).not.toBeVisible(
      { timeout: 15_000 },
    );

    // 1. Measure Document Load Latency
    const loadStart = performance.now();
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

    // Wait until EmbedPDF registry is fully initialized
    await page.waitForFunction(
      () => (window as any).__embedPdfRegistry !== undefined,
      null,
      { timeout: 30_000 },
    );
    const loadLatency = performance.now() - loadStart;

    // Run the remaining benchmarks inside the browser context
    const results = await page.evaluate(async () => {
      const registry = (window as any).__embedPdfRegistry;
      const docManager = registry.getPlugin("document-manager").provides();
      const activeDoc = docManager.getActiveDocument();
      if (!activeDoc) {
        throw new Error("No active document found");
      }

      const renderPlugin = registry.getPlugin("render").provides();
      const renderScope = renderPlugin.forDocument(activeDoc.id);
      const searchPlugin = registry.getPlugin("search").provides();

      const formats = [
        "image/bmp",
        "image/webp",
        "image/jpeg",
        "image/png",
      ] as const;
      const runs = 5;

      // Define standard tiles to render
      const tileP0Origin = {
        pageIndex: 0,
        rect: { origin: { x: 0, y: 0 }, size: { width: 512, height: 512 } },
      };
      const tileP0Offset = {
        pageIndex: 0,
        rect: { origin: { x: 256, y: 256 }, size: { width: 512, height: 512 } },
      };
      const tilesToTest = [tileP0Origin, tileP0Offset];

      const renderHelper = async (
        pageIndex: number,
        rect: {
          origin: { x: number; y: number };
          size: { width: number; height: number };
        },
        format: string,
      ) => {
        const task = renderScope.renderPageRect({
          pageIndex,
          rect,
          options: { scaleFactor: 1, dpr: 1, imageType: format },
        });
        return new Promise<void>((resolve, reject) => {
          task.wait(resolve, reject);
        });
      };

      // A. Warmup runs (with exact same parameters to warm WASM/JIT)
      for (const format of formats) {
        for (const tile of tilesToTest) {
          await renderHelper(tile.pageIndex, tile.rect, format);
        }
      }

      // Small delay after warmup
      await new Promise((r) => setTimeout(r, 100));

      const stats: Record<
        string,
        { total: number; runs: number; p0Origin: number[]; p0Offset: number[] }
      > = {};
      for (const format of formats) {
        stats[format] = { total: 0, runs: 0, p0Origin: [], p0Offset: [] };
      }

      // Fisher-Yates shuffle helper to randomize format execution order in each iteration
      const shuffle = <T>(array: readonly T[]): T[] => {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      };

      // B. Measurement runs (rendering)
      for (let run = 0; run < runs; run++) {
        const randomizedFormats = shuffle(formats);
        for (const format of randomizedFormats) {
          await new Promise((r) => setTimeout(r, 20));

          // Measure Page 0 Origin
          const t0 = performance.now();
          await renderHelper(tileP0Origin.pageIndex, tileP0Origin.rect, format);
          const durP0Origin = performance.now() - t0;

          // Measure Page 0 Offset
          const t1 = performance.now();
          await renderHelper(tileP0Offset.pageIndex, tileP0Offset.rect, format);
          const durP0Offset = performance.now() - t1;

          const runTotal = durP0Origin + durP0Offset;
          stats[format].total += runTotal;
          stats[format].runs += 1;
          stats[format].p0Origin.push(durP0Origin);
          stats[format].p0Offset.push(durP0Offset);
        }
      }

      // C. Measure Text Search Speed (5 runs for search latency)
      searchPlugin.startSearch();
      // Warmup search
      await searchPlugin.searchAllPages("PDF");

      const searchTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const tSearchStart = performance.now();
        await searchPlugin.searchAllPages("PDF");
        searchTimes.push(performance.now() - tSearchStart);
      }
      const avgSearchSpeed = searchTimes.reduce((a, b) => a + b, 0) / 5;

      // Compute averages
      const finalAverages: Record<
        string,
        { avg: number; p0OriginAvg: number; p0OffsetAvg: number }
      > = {};
      for (const format of formats) {
        const fStat = stats[format];
        finalAverages[format] = {
          avg: fStat.total / (fStat.runs * 2),
          p0OriginAvg: fStat.p0Origin.reduce((a, b) => a + b, 0) / fStat.runs,
          p0OffsetAvg: fStat.p0Offset.reduce((a, b) => a + b, 0) / fStat.runs,
        };
      }

      return {
        render: finalAverages,
        searchSpeed: avgSearchSpeed,
      };
    });

    // Formatting output table
    console.log(
      "\n[BENCHMARK] ==================== VIEWER HOT-PATHS PERFORMANCE ====================",
    );
    console.log(
      `[BENCHMARK] Document Initialization Latency: ${loadLatency.toFixed(2)} ms`,
    );
    console.log(
      `[BENCHMARK] Document Text Search Latency:     ${results.searchSpeed.toFixed(2)} ms`,
    );
    console.log("[BENCHMARK]");
    console.log(
      "[BENCHMARK] Format       | Avg Tile (ms) | P0 Origin (ms) | P0 Offset (ms)",
    );
    console.log(
      "[BENCHMARK] -------------+---------------+----------------+----------------",
    );
    for (const [format, times] of Object.entries(results.render)) {
      const name = format.padEnd(12);
      const avg = times.avg.toFixed(2).padStart(13);
      const p0 = times.p0OriginAvg.toFixed(2).padStart(14);
      const p1 = times.p0OffsetAvg.toFixed(2).padStart(14);
      console.log(`[BENCHMARK] ${name} | ${avg} | ${p0} | ${p1}`);
    }
    console.log(
      "[BENCHMARK] ========================================================================\n",
    );

    // Performance regression gates
    expect(Object.keys(results.render).length).toBe(4);
    expect.soft(loadLatency).toBeLessThan(4000);
    expect.soft(results.searchSpeed).toBeLessThan(1000);
    expect.soft(results.render["image/bmp"].avg).toBeLessThan(1000);
  });
});
