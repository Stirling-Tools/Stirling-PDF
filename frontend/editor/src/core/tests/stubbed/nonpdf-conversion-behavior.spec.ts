import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

const FIXTURES = path.join(import.meta.dirname, "..", "test-fixtures");
const PDF_BYTES = fs.readFileSync(path.join(FIXTURES, "sample.pdf"));

function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

async function fulfillPdf(route: Route): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/pdf",
    headers: { "Content-Disposition": 'attachment; filename="converted.pdf"' },
    body: PDF_BYTES,
  });
}

async function openFile(page: Page, name: string): Promise<void> {
  await uploadFiles(page, fixture(name));
  await expect(page.getByTestId("nonpdf-viewer")).toBeVisible();
}

async function expectPdfFocus(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement?.hasAttribute("data-pdf-focus-target") ??
          false,
      ),
    )
    .toBe(true);
}

test.describe("non-PDF conversion handoff", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  test("the big action converts directly, without a dialog", async ({
    page,
  }) => {
    await page.route("**/api/v1/convert/ebook/pdf", fulfillPdf);

    await openFile(page, "sample.epub");
    await expect(page.getByTestId("nonpdf-hero")).toContainText("sample.epub");
    await page.getByTestId("nonpdf-convert").click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/Converted to PDF/i)).toBeVisible();
    await expect(page.locator(".pdf-viewer-toolbar-dock")).toBeVisible();
    await expectPdfFocus(page);
  });

  test("cancel returns focus to Convert to PDF", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/v1/convert/ebook/pdf", async (route) => {
      await gate;
      await fulfillPdf(route);
    });

    await openFile(page, "sample.epub");
    await page.getByTestId("nonpdf-convert").click();
    await expect(page.getByTestId("nonpdf-conversion-progress")).toBeVisible();
    await page.getByTestId("nonpdf-conversion-cancel").click();

    await expect(page.getByTestId("nonpdf-convert")).toBeFocused();
    release();
  });

  test("failure focuses Try again and offers Open in Convert", async ({
    page,
  }) => {
    await page.route("**/api/v1/convert/ebook/pdf", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          message: "The EPUB is password protected.",
        }),
      }),
    );

    await openFile(page, "sample.epub");
    await page.getByTestId("nonpdf-convert").click();

    await expect(page.getByTestId("nonpdf-conversion-error")).toBeVisible();
    await expect(page.getByTestId("nonpdf-conversion-retry")).toBeFocused();
    await expect(
      page.getByTestId("nonpdf-conversion-open-convert"),
    ).toBeVisible();
    await expect(page.getByTestId("nonpdf-convert-options")).toHaveCount(0);
    await expect(page.getByTestId("nonpdf-options")).toHaveCount(0);
  });

  test("a cancelled request cannot clear the replacement request's guard", async ({
    page,
  }) => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstSettled = false;
    let requests = 0;

    await page.route("**/api/v1/convert/ebook/pdf", async (route) => {
      requests += 1;
      if (requests === 1) {
        await firstGate;
        await fulfillPdf(route).catch(() => undefined);
        firstSettled = true;
        return;
      }
      await fulfillPdf(route);
    });

    await openFile(page, "sample.epub");
    await page.getByTestId("nonpdf-convert").click();
    await expect(page.getByTestId("nonpdf-conversion-progress")).toBeVisible();
    await page.getByTestId("nonpdf-conversion-cancel").click();
    await expect(page.getByTestId("nonpdf-convert")).toBeEnabled();

    await page.getByTestId("nonpdf-convert").click();
    await expect(page.getByText(/Converted to PDF/i)).toBeVisible();
    await expect(page.locator(".pdf-viewer-toolbar-dock")).toBeVisible();

    releaseFirst();
    await expect.poll(() => firstSettled).toBe(true);
    await expect(
      page.locator(".file-sidebar-file-item").filter({ hasText: "converted" }),
    ).toHaveCount(1);
    expect(requests).toBe(2);
  });

  test("Open in Convert carries the source file into the tool", async ({
    page,
  }) => {
    await page.route("**/api/v1/convert/ebook/pdf", (route: Route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ message: "Nope" }),
      }),
    );

    await openFile(page, "sample.epub");
    await page.getByTestId("nonpdf-convert").click();
    await expect(page.getByTestId("nonpdf-conversion-error")).toBeVisible();
    await page.getByTestId("nonpdf-conversion-open-convert").click();

    await expect(page).toHaveURL(/\/convert/);
    await expect(page.getByText("Convert from:")).toBeVisible();
    await expect(page.getByText("eBook (EPUB)")).toBeVisible();
    await expect(page.getByTestId("nonpdf-conversion-error")).toHaveCount(0);
  });

  test("switching files before the save aborts the pending conversion", async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let settled = false;
    await page.route("**/api/v1/convert/ebook/pdf", async (route) => {
      await gate;
      await fulfillPdf(route).catch(() => undefined);
      settled = true;
    });

    await openFile(page, "sample.epub");
    await page.getByTestId("nonpdf-convert").click();
    await expect(page.getByTestId("nonpdf-conversion-progress")).toBeVisible();

    await uploadFiles(page, fixture("sample.csv"));
    await expect(page.getByTestId("nonpdf-conversion-bar")).toBeVisible();

    release();
    await expect.poll(() => settled).toBe(true);
    await expect(
      page.locator(".file-sidebar-file-item").filter({ hasText: "converted" }),
    ).toHaveCount(0);
  });
});
