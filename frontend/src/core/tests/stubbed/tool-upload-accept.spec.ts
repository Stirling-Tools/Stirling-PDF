import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * The "Files" step on the left-hand tool panel renders an Upload link (when
 * the user has no recent files cached in IndexedDB) that synthesises a native
 * `<input type="file">` and triggers a click. Each tool's upload picker should
 * advertise an `accept` attribute that matches the formats the underlying
 * endpoint actually consumes — PDF for everything except Convert (and a small
 * number of other tools that accept raw images, e.g. ScannerImageSplit).
 *
 * These specs install a hook on `HTMLInputElement.prototype.click` that
 * captures the synthesised input's `accept` value before the native picker
 * would open, then asserts on it. The hook also no-ops the click so the
 * browser does not try to show a file dialog under Playwright.
 */

const TOOL_PANEL = '[data-sidebar="tool-panel"]';

async function captureUploadAccept(page: Page): Promise<string> {
  // Wait for the tool panel and upload link to render — FileStatusIndicator
  // returns null until its async recent-files check resolves.
  const uploadLink = page
    .locator(TOOL_PANEL)
    .getByText(/^upload$/i)
    .first();
  await expect(uploadLink).toBeVisible({ timeout: 10_000 });

  await page.evaluate(() => {
    const w = window as unknown as {
      __uploadAccepts?: string[];
      __originalInputClick?: () => void;
    };
    w.__uploadAccepts = [];
    w.__originalInputClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === "file") {
        w.__uploadAccepts!.push(this.accept);
        return;
      }
      w.__originalInputClick!.call(this);
    };
  });

  await uploadLink.click();

  const accepts = await page.evaluate(
    () => (window as unknown as { __uploadAccepts: string[] }).__uploadAccepts,
  );
  expect(accepts.length).toBeGreaterThan(0);
  return accepts[0]!;
}

const PDF_ONLY_TOOLS = [
  { route: "/add-stamp", label: "Add Stamp" },
  { route: "/add-password", label: "Add Password" },
  { route: "/compress", label: "Compress" },
  { route: "/rotate", label: "Rotate" },
  { route: "/sanitize", label: "Sanitize" },
  { route: "/split", label: "Split" },
  { route: "/watermark", label: "Add Watermark" },
];

test.describe("Tool upload picker — accept attribute", () => {
  for (const tool of PDF_ONLY_TOOLS) {
    test(`${tool.label} upload picker accepts PDF only`, async ({ page }) => {
      await page.goto(tool.route);
      await page.waitForLoadState("domcontentloaded");

      const accept = await captureUploadAccept(page);
      const tokens = accept.split(",").map((t) => t.trim());

      expect(tokens).toContain(".pdf");
      expect(tokens).toContain("application/pdf");
      // Should NOT advertise non-PDF formats
      expect(tokens).not.toContain(".docx");
      expect(tokens).not.toContain(".png");
      expect(tokens).not.toContain(".jpg");
      expect(tokens).not.toContain(".html");
    });
  }

  test("Convert upload picker accepts the broad CONVERT_SUPPORTED_FORMATS list", async ({
    page,
  }) => {
    await page.goto("/convert");
    await page.waitForLoadState("domcontentloaded");

    const accept = await captureUploadAccept(page);
    const tokens = accept.split(",").map((t) => t.trim());

    // Convert supports many input formats — sample a representative few to
    // catch a regression where supportedFormats stops flowing through.
    expect(tokens).toContain(".pdf");
    expect(tokens).toContain(".docx");
    expect(tokens).toContain(".png");
    expect(tokens).toContain(".jpg");
    expect(tokens).toContain(".html");
    expect(tokens).toContain(".epub");
  });

  test("ScannerImageSplit upload picker accepts both PDF and raw images", async ({
    page,
  }) => {
    await page.goto("/scanner-image-split");
    await page.waitForLoadState("domcontentloaded");

    const accept = await captureUploadAccept(page);
    const tokens = accept.split(",").map((t) => t.trim());

    expect(tokens).toContain(".pdf");
    expect(tokens).toContain(".jpg");
    expect(tokens).toContain(".png");
    // Should NOT pick up Convert-only formats like .docx
    expect(tokens).not.toContain(".docx");
  });
});
