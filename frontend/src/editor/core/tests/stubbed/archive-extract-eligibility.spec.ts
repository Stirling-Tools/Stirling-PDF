import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { dismissTourTooltip } from "@editor/tests/helpers/ui-helpers";
import type { Locator, Page } from "@playwright/test";
import JSZip from "jszip";

/**
 * ZIP-based documents are containers, not archives: only `.zip` files may be
 * auto-extracted or offered the Unzip action.
 */

test.use({ autoGoto: false, viewport: { width: 1600, height: 900 } });

interface UploadPayload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

async function zip(
  entries: Record<string, string | Uint8Array>,
): Promise<Buffer> {
  const archive = new JSZip();
  for (const [name, content] of Object.entries(entries)) {
    archive.file(name, content);
  }
  return Buffer.from(await archive.generateAsync({ type: "uint8array" }));
}

async function uploadPayloads(page: Page, payloads: UploadPayload[]) {
  await page.getByTestId("files-button").click();
  await page.locator('[data-testid="file-input"]').setInputFiles(payloads);
  for (const payload of payloads) {
    await expect(
      page.locator(".file-sidebar-file-item").filter({ hasText: payload.name }),
    ).toHaveCount(1, { timeout: 20_000 });
  }
}

async function switchToActiveFiles(page: Page) {
  await page
    .locator('[data-tour="view-switcher"]')
    .first()
    .locator(".mantine-SegmentedControl-label", { hasText: "Active Files" })
    .click();
}

function card(page: Page, name: string): Locator {
  return page
    .locator('[data-testid="file-thumbnail"]')
    .filter({ hasText: name });
}

const DOCX = await zip({
  "[Content_Types].xml": "<Types/>",
  "word/document.xml": "<document/>",
});
const ODT = await zip({
  mimetype: "application/vnd.oasis.opendocument.text",
  "content.xml": "<document/>",
});
const CBZ = await zip({ "page-01.png": "image" });
const CBR = Buffer.from("Rar!\x1a\x07\x00", "binary");
const REAL_ZIP = await zip({
  "index.html": "<html></html>",
  "assets/app.js": "console.log('hi')",
});
const REAL_ZIP_PAYLOAD: UploadPayload = {
  name: "site.zip",
  mimeType: "application/zip",
  buffer: REAL_ZIP,
};

// The browser may report a document container as a generic binary or even as
// application/zip; neither changes what the file actually is.
const CONTAINERS: UploadPayload[] = [
  { name: "report.docx", mimeType: "application/octet-stream", buffer: DOCX },
  { name: "notes.odt", mimeType: "application/octet-stream", buffer: ODT },
  { name: "comic.cbz", mimeType: "application/zip", buffer: CBZ },
  { name: "comic.cbr", mimeType: "application/x-rar-compressed", buffer: CBR },
];

async function openActiveFiles(page: Page, payloads: UploadPayload[]) {
  await page.goto("/editor", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await uploadPayloads(page, payloads);
  await dismissTourTooltip(page);
  await switchToActiveFiles(page);
}

test.describe("Archive extraction eligibility", () => {
  test("ZIP-based documents are kept intact and never offered Unzip", async ({
    page,
  }) => {
    await openActiveFiles(page, CONTAINERS);

    for (const payload of CONTAINERS) {
      const fileCard = card(page, payload.name);
      await expect(fileCard).toBeVisible({ timeout: 20_000 });
      await fileCard.hover();
      await expect(fileCard.getByRole("button", { name: "Unzip" })).toHaveCount(
        0,
      );
    }

    // The DOCX/ODT internals were not extracted into the workbench.
    await expect(page.getByText("[Content_Types].xml")).toHaveCount(0);
    await expect(page.getByText("word/document.xml")).toHaveCount(0);
    await expect(page.getByText("content.xml")).toHaveCount(0);
  });

  test("a real .zip archive still offers Unzip", async ({ page }) => {
    await openActiveFiles(page, [REAL_ZIP_PAYLOAD]);

    const fileCard = card(page, "site.zip");
    await expect(fileCard).toBeVisible({ timeout: 20_000 });
    await fileCard.hover();
    await expect(fileCard.getByRole("button", { name: "Unzip" })).toBeVisible();
  });
});
