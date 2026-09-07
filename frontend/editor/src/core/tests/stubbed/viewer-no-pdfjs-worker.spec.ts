import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES_DIR, "sample.pdf");
const MULTIPAGE_PDF = path.join(FIXTURES_DIR, "multi-page-sample.pdf");

function isPdfWorkerOrPdfJsRequest(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("pdf.worker") || lower.includes("vendor-pdfjs");
}

test.describe("Viewer PDF.js worker elimination & performance verification", () => {
  test("opening PDF in viewer does not download pdf.worker or vendor-pdfjs", async ({
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

    const fileInput = page.locator('[data-testid="file-input"]').first();
    await fileInput.setInputFiles(SAMPLE_PDF);

    const firstPage = page.locator('[data-page-index="0"]').first();
    await expect(firstPage).toBeVisible({ timeout: 30_000 });

    // Wait for viewer layout and sidebar background checks to settle
    await page.waitForTimeout(2_000);

    expect(
      workerRequests,
      `Expected zero pdf.worker or vendor-pdfjs requests when opening PDF in viewer, but observed:\n${workerRequests.join("\n")}`,
    ).toEqual([]);

    // Open second PDF to verify subsequent opens remain completely zero-worker
    await fileInput.setInputFiles(MULTIPAGE_PDF);
    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(2_000);

    expect(
      workerRequests,
      `Expected zero pdf.worker or vendor-pdfjs requests across multiple PDF opens, but observed:\n${workerRequests.join("\n")}`,
    ).toEqual([]);
  });

  test("toggling viewer layer sidebar does not fetch pdf.worker or vendor-pdfjs", async ({
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

    const fileInput = page.locator('[data-testid="file-input"]').first();
    await fileInput.setInputFiles(SAMPLE_PDF);

    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
      timeout: 30_000,
    });

    // Check layer sidebar toggle button if visible or open layer sidebar
    const layersButton = page
      .getByRole("button", { name: /Toggle Layers|Layers/i })
      .first();
    if (await layersButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await layersButton.click();
      await page.waitForTimeout(1_000);
    }

    expect(
      workerRequests,
      `Expected zero pdf.worker or vendor-pdfjs requests when toggling layers, but observed:\n${workerRequests.join("\n")}`,
    ).toEqual([]);
  });
});
