import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page, TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from "@cantoo/pdf-lib";

const fixtures = path.join(import.meta.dirname, "../test-fixtures");

async function openAnnotate(page: Page) {
  await page.goto("/annotate", { waitUntil: "domcontentloaded" });
  await page.getByTestId("files-button").click();
  await page
    .getByTestId("file-input")
    .setInputFiles(path.join(fixtures, "annotation-text-sample.pdf"));
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Comments", exact: true }).click();
  const comments = page.locator(".comments-sidebar");
  await expect(comments.locator("[data-comment-card]")).not.toHaveCount(0);
  return { firstPage, comments };
}

async function typeNewComment(page: Page, text: string) {
  const { firstPage, comments } = await openAnnotate(page);
  await comments
    .getByRole("button", { name: /Add comment/ })
    .first()
    .click();
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("PDF page has no bounds");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await comments.getByPlaceholder("Add comment...").fill(text);
}

async function downloadedContents(page: Page, testInfo: TestInfo) {
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /download|export/i })
    .first()
    .click();
  const destination = testInfo.outputPath("saved.pdf");
  await (await downloadPromise).saveAs(destination);
  const doc = await PDFDocument.load(fs.readFileSync(destination));
  const contents: string[] = [];
  for (const pdfPage of doc.getPages()) {
    const annots = pdfPage.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    for (let i = 0; i < (annots?.size() ?? 0); i++) {
      const annot = annots!.lookup(i, PDFDict);
      const value = annot.lookup(PDFName.of("Contents"));
      if (value instanceof PDFString || value instanceof PDFHexString) {
        contents.push(value.decodeText());
      }
    }
  }
  return contents;
}

test("a new comment typed but not sent is kept by Save Changes", async ({
  page,
}, testInfo) => {
  await typeNewComment(page, "Unsent comment");
  const save = page.getByRole("button", { name: "Save Changes", exact: true });
  await save.click();
  await expect(
    page.locator(".comments-sidebar").getByPlaceholder("Add comment..."),
  ).toHaveCount(0);
  // The posted draft is part of the save, so nothing is left unsaved.
  await expect(save).toBeDisabled({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await expect(save).toBeDisabled();
  expect(await downloadedContents(page, testInfo)).toContain("Unsent comment");
});

test("a new comment typed but not sent is kept by download", async ({
  page,
}, testInfo) => {
  await typeNewComment(page, "Downloaded comment");
  expect(await downloadedContents(page, testInfo)).toContain(
    "Downloaded comment",
  );
});

test("a reply typed but not sent is kept by download", async ({
  page,
}, testInfo) => {
  const { comments } = await openAnnotate(page);
  await comments.getByPlaceholder("Add reply...").first().fill("Unsent reply");
  expect(await downloadedContents(page, testInfo)).toContain("Unsent reply");
});
