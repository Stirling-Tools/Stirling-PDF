import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
// Two OCG layers with the catalog inside a compressed object stream (built by
// `qpdf --object-streams=generate`); exercises the layer path end to end.
const LAYERED_PDF = path.join(FIXTURES_DIR, "layers-object-streams.pdf");

function isPdfWorkerOrPdfJsRequest(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("pdf.worker") || lower.includes("vendor-pdfjs");
}

test.describe("Viewer PDF.js worker elimination & performance verification", () => {
  // The base fixture auto-navigates before the test body runs; without this
  // the request listener below misses the initial navigation it must observe.
  test.use({ autoGoto: false });

  // No static pdf.js import may ride the initial bundle.
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

    await page.waitForLoadState("networkidle");

    expect(
      workerRequests,
      `Expected zero pdf.worker or vendor-pdfjs requests on initial load, but observed:\n${workerRequests.join("\n")}`,
    ).toEqual([]);
  });

  // Opening a document must not start any pdf.js worker.
  test("opening a PDF does not download pdf.worker or vendor-pdfjs", async ({
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
    await fileInput.setInputFiles(
      path.join(FIXTURES_DIR, "multi-page-sample.pdf"),
    );

    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle");

    expect(
      workerRequests,
      `Expected zero pdf.worker or vendor-pdfjs requests when opening a PDF, but observed:\n${workerRequests.join("\n")}`,
    ).toEqual([]);
  });

  // The sidebar parses /OCProperties with PdfFileReader in its own worker;
  // an object-stream catalog proves it is not a raw byte scan.
  test("layer sidebar lists layers of an object-stream-compressed file without a pdf.js worker", async ({
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

    expect(
      workerRequests,
      `Expected zero pdf.worker or vendor-pdfjs requests when opening the layer sidebar, but observed:\n${workerRequests.join("\n")}`,
    ).toEqual([]);
  });
});
