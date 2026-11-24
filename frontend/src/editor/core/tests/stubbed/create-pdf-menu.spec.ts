import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "node:path";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

const TO_PDF_ENDPOINTS = [
  "file-to-pdf",
  "img-to-pdf",
  "html-to-pdf",
  "markdown-to-pdf",
  "eml-to-pdf",
  "svg-to-pdf",
  "cbr-to-pdf",
  "cbz-to-pdf",
  "ebook-to-pdf",
];

async function openLibraryMenu(page: Page) {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("pdf-library-add-files").click();
  await expect(page.getByTestId("create-pdf-blank")).toBeVisible();
}

async function expectBlankInEditor(page: Page) {
  await page.waitForURL(/pdf-text-editor/, { timeout: 30_000 });
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
}

test("the landing page has no Create PDF button", async ({ page }) => {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("landing-file-input")).toBeAttached();
  await expect(page.getByTestId("landing-create-pdf")).toHaveCount(0);
});

test("the library menu offers a blank page and converting another file when the server can convert", async ({
  page,
}) => {
  await openLibraryMenu(page);
  await expect(page.getByTestId("create-pdf-source")).toBeVisible();
});

test("the library menu offers only a blank page when the server cannot convert files to PDF", async ({
  page,
}) => {
  await page.route("**/api/v1/config/endpoints-availability", (route) =>
    route.fulfill({
      json: Object.fromEntries(
        TO_PDF_ENDPOINTS.map((endpoint) => [
          endpoint,
          { enabled: false, reason: "DEPENDENCY" },
        ]),
      ),
    }),
  );
  await openLibraryMenu(page);
  await expect(page.getByTestId("create-pdf-source")).toHaveCount(0);
});

test("the library menu offers converting another file when only image conversion is on", async ({
  page,
}) => {
  await page.route("**/api/v1/config/endpoints-availability", (route) =>
    route.fulfill({
      json: { "file-to-pdf": { enabled: false, reason: "DEPENDENCY" } },
    }),
  );
  await openLibraryMenu(page);
  await expect(page.getByTestId("create-pdf-source")).toBeVisible();
  await expect(page.getByTestId("create-pdf-source-input")).toHaveAttribute(
    "accept",
    /\.png/,
  );
});

test("the expanded file library creates a blank PDF from its side panel", async ({
  page,
}) => {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("landing-file-input").setInputFiles(SAMPLE_PDF);
  await page.getByTestId("open-files-page").click({ force: true });
  await page.getByTestId("files-page-create-pdf").click();
  await page.getByTestId("create-pdf-blank").click();
  await expectBlankInEditor(page);
});

test("the text editor with no file creates a new blank PDF", async ({
  page,
}) => {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.getByText("PDF Text Editor", { exact: true }).first().click();
  await expect(page.getByTestId("pdf-editor-sidebar-empty")).toBeVisible();
  await page.getByTestId("pdf-editor-create-new-pdf").click();
  await expectBlankInEditor(page);
  await expect(page.getByTestId("pdf-editor-sidebar-empty")).toHaveCount(0);
});

test("picking a PDF that is already open opens it in the text editor", async ({
  page,
}) => {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("landing-file-input").setInputFiles(SAMPLE_PDF);
  await page.getByTestId("pdf-library-add-files").click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("create-pdf-source").click();
  await (await chooser).setFiles(SAMPLE_PDF);
  await expectBlankInEditor(page);
});
