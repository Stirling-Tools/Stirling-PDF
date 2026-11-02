import { test, expect } from "@editor/tests/helpers/stub-test-base";
import {
  captureViewerPageBitmap,
  compareViewerPageToPdfjs,
  installReferencePage,
  measurePngInk,
  referencePageCount,
} from "@editor/tests/helpers/pdfjsVisualReference";
import {
  ensureViewerCorpus,
  type ViewerCorpus,
} from "@editor/tests/helpers/viewerCorpus";

/**
 * Screen-render regression for the viewer on the ECI Altona corpus.
 *
 * The first Chromium run downloads the Altona 1.2 PDFs into the ignored
 * frontend/.cache directory. Set ECI_DIR to use local copies instead. The
 * 120 MB Altona 2.0 page is opt-in with VIEWER_CORPUS_HEAVY=1 or a local
 * ECI_DIR copy.
 *
 * Ghent is intentionally absent: its diagnostics depend on print overprint
 * behavior that PDFium's display path does not implement. The Ghent print gate
 * lives in JPDFium's GhentOutputSuiteTest.
 */
let corpus: ViewerCorpus | null = null;

test.beforeAll(async ({ browserName }) => {
  if (browserName !== "chromium") return;
  corpus = await ensureViewerCorpus();
}, 300_000);

test.beforeEach(({ browserName }) => {
  test.skip(
    browserName !== "chromium",
    "Visual corpus baselines are Chromium-only",
  );
});

async function openViewer(
  page: import("@playwright/test").Page,
  file: string,
): Promise<void> {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 120_000,
  });
}

async function assertViewerPageCount(
  page: import("@playwright/test").Page,
  expected: number,
): Promise<void> {
  const totalPages = page
    .locator(".pdf-viewer-toolbar span")
    .filter({ hasText: /^\/ \d+$/ })
    .first();
  await expect(totalPages).toHaveText(`/ ${expected}`);
}

async function captureViewerPage(
  page: import("@playwright/test").Page,
  index: number,
): Promise<Buffer> {
  const element = page.locator(`[data-page-index="${index}"]`).first();
  await element.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () =>
        element
          .locator("img")
          .evaluateAll(
            (images) =>
              images.length > 0 &&
              images.every(
                (image) =>
                  (image as HTMLImageElement).complete &&
                  (image as HTMLImageElement).naturalWidth > 0,
              ),
          ),
      { timeout: 120_000 },
    )
    .toBe(true);
  return captureViewerPageBitmap(page, index);
}

async function assertCorpusMatchesReference(
  page: import("@playwright/test").Page,
  context: import("@playwright/test").BrowserContext,
  file: string,
  label: string,
  minCorrelation = 0.97,
  maxInkDelta = 0.03,
): Promise<void> {
  await openViewer(page, file);
  const reference = await context.newPage();
  await installReferencePage(reference, file);
  const pageCount = await referencePageCount(reference);
  await assertViewerPageCount(page, pageCount);
  for (let index = 0; index < pageCount; index++) {
    const screenshot = await captureViewerPage(page, index);
    const metrics = await compareViewerPageToPdfjs(
      reference,
      screenshot,
      index + 1,
    );
    expect(
      metrics.correlation,
      `${label} page ${index + 1} differs from the PDF.js reference`,
    ).toBeGreaterThan(minCorrelation);
    expect(
      Math.abs(metrics.viewerInk - metrics.referenceInk),
      `${label} page ${index + 1} has a different ink coverage`,
    ).toBeLessThan(maxInkDelta);
  }
  await reference.close();
}

test.use({ viewport: { width: 1600, height: 1000 } });
test.describe.configure({ mode: "serial", timeout: 300_000 });

test.describe("ECI Altona 1.2", () => {
  test("visual page matches the PDF.js reference", async ({
    page,
    context,
  }) => {
    await assertCorpusMatchesReference(
      page,
      context,
      corpus!.altonaVisual,
      "ECI Altona 1.2 visual",
    );
  });

  test("technical page matches the PDF.js reference", async ({
    page,
    context,
  }) => {
    await assertCorpusMatchesReference(
      page,
      context,
      corpus!.altonaTechnical,
      "ECI Altona 1.2 technical",
    );
  });
});

test.describe("ECI Altona 2.0 technical", () => {
  test("heavy page renders without a blank frame", async ({ page }) => {
    test.skip(
      !corpus!.altonaTechnical2,
      "set VIEWER_CORPUS_HEAVY=1 or ECI_DIR to include the 120 MB page",
    );
    await openViewer(page, corpus!.altonaTechnical2!);
    await assertViewerPageCount(page, 1);
    const screenshot = await captureViewerPage(page, 0);
    const ink = await measurePngInk(page, screenshot);
    // PDF.js cannot hold this 120 MB page in the test browser, so the visual
    // oracle is coverage rather than a reference render. The page has wide
    // light margins, so blankness is the failure mode, not low coverage.
    expect(ink).toBeGreaterThan(0.25);
  });
});
