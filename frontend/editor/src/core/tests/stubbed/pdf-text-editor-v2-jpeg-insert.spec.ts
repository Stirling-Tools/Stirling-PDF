import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";

/**
 * Inserting a JPEG embeds the original JPEG stream (DCTDecode) instead of
 * re-encoding decoded RGBA pixels (FlateDecode), so the output stays small
 * (finding R). Verified by scanning the saved PDF for the DCTDecode filter.
 */

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");
const SAMPLE_JPG = path.join(__dirname, "../test-fixtures/sample.jpg");

test("inserting a JPEG embeds it as DCTDecode, not re-encoded RGBA", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(90_000);
  await page.route("**/encode-charcodes", (route: Route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE_PDF);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  // Insert the JPEG via the editor's image input.
  await page
    .locator('[data-testid="v2-image-input"]')
    .setInputFiles(SAMPLE_JPG);
  await page.waitForTimeout(1500);

  // Save and scan the bytes for the JPEG (DCTDecode) filter.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("v2-save").click();
  const dl = await downloadPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const saved = Buffer.concat(chunks);
  const asText = saved.toString("latin1");

  expect(saved.subarray(0, 4).toString("ascii")).toBe("%PDF");
  expect(
    asText.includes("DCTDecode"),
    "saved PDF embeds the JPEG as DCTDecode (passthrough)",
  ).toBe(true);
});
