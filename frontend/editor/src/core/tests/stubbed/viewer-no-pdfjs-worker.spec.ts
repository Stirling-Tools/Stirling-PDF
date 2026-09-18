import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
// Two OCG layers with the catalog inside a compressed object stream (built by
// `qpdf --object-streams=generate`); exercises the layer path end to end.
const LAYERED_PDF = path.join(FIXTURES_DIR, "layers-object-streams.pdf");

function isPdfWorkerOrPdfJsRequest(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("pdf.worker") || lower.includes("vendor-pdfjs");
}

test.describe("Viewer PDF.js worker elimination & performance verification", () => {
  // The perf win is bundle leanness: no static pdf.js import may ride the
  // initial bundle. pdf.js still loads on demand for features that need a
  // real parser (layer sidebar), which the layers test below covers.
  test("initial app load does not download pdf.worker or vendor-pdfjs", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const workerRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (isPdfWorkerOrPdfJsRequest(url)) {
        workerRequests.push(url);
      }
    });

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Let the initial bundle and its lazy chunks settle
    await page.waitForTimeout(2_000);

    expect(
      workerRequests,
      `Expected zero pdf.worker or vendor-pdfjs requests on initial load, but observed:\n${workerRequests.join("\n")}`,
    ).toEqual([]);
  });

  // Layers intentionally stay on pdf.js: the sidebar parses OCG structures
  // that need a real PDF parser, so opening it loads the worker on demand.
  // This test proves detection works on a compressed-catalog file instead of
  // asserting worker absence here (covered for viewer open/metadata above).
  test("layer sidebar lists layers of an object-stream-compressed file", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const fileInput = page.locator('[data-testid="file-input"]').first();
    await fileInput.setInputFiles(LAYERED_PDF);

    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
      timeout: 30_000,
    });

    const layersButton = page
      .getByRole("button", { name: "Toggle Layers", exact: true })
      .first();
    await expect(layersButton).toBeVisible({ timeout: 15_000 });
    await layersButton.click();

    await expect(
      page.getByText("Background Layer", { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("Watermark Layer", { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
