import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";
import * as path from "path";
import * as fs from "fs";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFString,
  PDFHexString,
} from "@cantoo/pdf-lib";

/**
 * End-to-end validation of the "Add bookmark" button on the viewer's
 * bookmark sidebar.
 *
 *   1. Logs in and uploads a sample PDF via the Read tool's viewer.
 *   2. Opens the bookmark sidebar and types a bookmark title inline.
 *   3. Saves, intercepts the backend response.
 *   4. Loads the produced PDF with pdf-lib and verifies it actually
 *      contains the new bookmark.
 *
 * Requires a real Spring Boot backend on :8080 - registered under the
 * `live` Playwright project. The `live-setup` project bootstraps the
 * admin user before this runs.
 */

function fixture(filename: string): string {
  const candidates = [
    path.resolve(
      process.cwd(),
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
    path.resolve(
      process.cwd(),
      "frontend",
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Test fixture not found: ${filename} (tried: ${candidates.join(", ")})`,
  );
}

async function openSamplePdfInViewer(page: import("@playwright/test").Page) {
  await page.goto("/read");
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator('[data-testid="file-input"]')
    .first()
    .setInputFiles(fixture("sample.pdf"));
  // Page indicator confirms the embedded viewer has the document loaded.
  await expect(page.getByText(/\/\s*1/).first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("Viewer sidebar add buttons - real PDF round-trip", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await loginAndSetup(page);
  });

  test("Add bookmark from viewer sidebar adds the bookmark to the produced PDF outline", async ({
    page,
  }) => {
    await openSamplePdfInViewer(page);
    const viewerUrl = page.url();

    await page
      .getByRole("button", { name: /Toggle Bookmarks/i })
      .first()
      .click();

    const addBtn = page.getByRole("button", { name: /^Add bookmark$/i });
    await expect(addBtn).toBeVisible({ timeout: 15_000 });

    await addBtn.click();

    // Stays in the viewer - URL doesn't change to /edit-table-of-contents.
    expect(page.url()).toBe(viewerUrl);

    // Inline form appears inside the sidebar with title + page inputs.
    const form = page.locator('[data-testid="bookmark-add-form"]');
    await expect(form).toBeVisible({ timeout: 10_000 });

    const BOOKMARK_TITLE = `Playwright test bookmark ${Date.now()}`;
    await form
      .getByRole("textbox", { name: /Bookmark title/i })
      .fill(BOOKMARK_TITLE);

    // Capture the backend POST the inline Save kicks off.
    const responsePromise = page.waitForResponse(
      (r) =>
        /\/api\/v1\/general\/edit-table-of-contents$/.test(r.url()) &&
        r.status() === 200,
      { timeout: 90_000 },
    );

    await form.getByRole("button", { name: /^Save$/i }).click();

    const response = await responsePromise;
    const pdfBytes = await response.body();

    // Form should close on success and the user should still be in the
    // viewer (no tool navigation).
    await expect(form).not.toBeVisible({ timeout: 10_000 });
    expect(page.url()).toBe(viewerUrl);

    expect(pdfBytes.slice(0, 5).toString()).toBe("%PDF-");

    // Verify the produced PDF has an /Outlines entry in the catalog and
    // the bookmark title we set is present in the document.
    const doc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const outlinesRef = doc.catalog.get(PDFName.of("Outlines"));
    expect(outlinesRef, "PDF catalog must have /Outlines entry").toBeDefined();

    // Walk the outline tree and collect titles.
    const outlinesDict = doc.context.lookup(outlinesRef, PDFDict);
    const collectTitles = (
      dictRef: ReturnType<PDFDict["get"]> | undefined,
      acc: string[],
    ): string[] => {
      if (!dictRef) return acc;
      const node = doc.context.lookupMaybe(dictRef, PDFDict);
      if (!node) return acc;
      const title = node.get(PDFName.of("Title"));
      if (title instanceof PDFString || title instanceof PDFHexString) {
        try {
          acc.push(title.decodeText());
        } catch {
          // Title couldn't decode - fall back to asString
          acc.push(title.asString());
        }
      }
      collectTitles(node.get(PDFName.of("First")), acc);
      collectTitles(node.get(PDFName.of("Next")), acc);
      return acc;
    };

    const titles = collectTitles(outlinesDict.get(PDFName.of("First")), []);
    expect(
      titles,
      `expected outline titles to include "${BOOKMARK_TITLE}", got ${JSON.stringify(titles)}`,
    ).toContain(BOOKMARK_TITLE);
  });
});
