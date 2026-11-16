import { test, expect, type Page } from "@playwright/test";
import path from "path";
import { readFileSync } from "node:fs";
import { mockAppApis } from "@editor/tests/helpers/api-stubs";
import {
  suppressNativeFilePicker,
  revealPickerTool,
} from "@editor/tests/helpers/ui-helpers";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function dismissTourTooltip(page: Page) {
  const closeBtn = page.getByRole("button", { name: /close tooltip/i }).first();
  if (await closeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeBtn.click();
  }
}

async function navigateToConvert(page: Page) {
  const tile = await revealPickerTool(page, "convert");
  await tile.click();
  await page.waitForSelector('[data-testid="convert-from-dropdown"]', {
    timeout: 5000,
  });
}

async function selectToFormat(page: Page, toValue: string) {
  await page.getByTestId("convert-to-dropdown").click();
  await page.getByTestId(`format-option-${toValue}`).click();
}

test.describe("Convert batches", () => {
  test.beforeEach(async ({ page }) => {
    suppressNativeFilePicker(page);
    await mockAppApis(page);
    await page.goto("/?bypassOnboarding=true");
    await expect(page.getByTestId("files-button")).toBeVisible();
  });

  for (const format of ["eml", "msg"]) {
    test(`converts every ${format.toUpperCase()} upload with its email settings`, async ({
      page,
    }) => {
      const payloads: string[] = [];
      await page.route("**/api/v1/convert/eml/pdf", (route) => {
        payloads.push(route.request().postData() ?? "");
        return route.fulfill({
          status: 200,
          contentType: "application/pdf",
          headers: {
            "Content-Disposition": `attachment; filename="email-${payloads.length}.pdf"`,
          },
          path: SAMPLE_PDF,
        });
      });
      await page.getByTestId("files-button").click();
      const buffer =
        format === "msg"
          ? readFileSync(
              path.resolve("../app/common/src/test/resources/eml/example.msg"),
            )
          : Buffer.from(
              "From: sender@example.com\r\nSubject: Email\r\n\r\nEmail content",
            );
      await page.getByTestId("file-input").setInputFiles(
        ["first", "second"].map((name) => ({
          name: `${name}.${format}`,
          mimeType:
            format === "msg" ? "application/vnd.ms-outlook" : "message/rfc822",
          buffer,
        })),
      );
      await navigateToConvert(page);
      await selectToFormat(page, "pdf");
      await expect(page.getByTestId("email-settings")).toBeVisible();
      await page.getByTestId("include-attachments-checkbox").check();
      await page.getByTestId("include-all-recipients-checkbox").uncheck();
      await dismissTourTooltip(page);
      const request = page.waitForRequest("**/api/v1/convert/eml/pdf");
      await page.getByTestId("convert-button").click();
      const payload = (await request).postData() ?? "";
      expect(payload).toMatch(/name="includeAttachments"\r\n\r\ntrue/);
      expect(payload).toMatch(/name="includeAllRecipients"\r\n\r\nfalse/);
      await expect(page.getByTestId("download-result-button")).toBeVisible();
      await expect.poll(() => payloads.length).toBe(2);
      for (const body of payloads) {
        expect(body).toMatch(/name="includeAttachments"\r\n\r\ntrue/);
        expect(body).toMatch(/name="includeAllRecipients"\r\n\r\nfalse/);
      }
    });
  }

  test("mixed Office, email and HTML uploads use their own conversion endpoints", async ({
    page,
  }) => {
    const requests: string[] = [];
    await page.route("**/api/v1/convert/**", (route) => {
      requests.push(new URL(route.request().url()).pathname);
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        path: SAMPLE_PDF,
        headers: {
          "Content-Disposition": `attachment; filename="converted-${requests.length}.pdf"`,
        },
      });
    });
    await page.getByTestId("files-button").click();
    await page.getByTestId("file-input").setInputFiles([
      {
        name: "letter.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: Buffer.from("document"),
      },
      {
        name: "mail.eml",
        mimeType: "message/rfc822",
        buffer: Buffer.from(
          "From: sender@example.com\r\nSubject: Email\r\n\r\nEmail",
        ),
      },
      {
        name: "page.html",
        mimeType: "text/html",
        buffer: Buffer.from("<html><body>HTML</body></html>"),
      },
      {
        name: "existing.pdf",
        mimeType: "application/pdf",
        buffer: readFileSync(SAMPLE_PDF),
      },
    ]);
    await navigateToConvert(page);
    await dismissTourTooltip(page);
    await page.getByTestId("convert-button").click();
    await expect(page.getByTestId("download-result-button")).toBeVisible();
    expect(requests).toEqual([
      "/api/v1/convert/file/pdf",
      "/api/v1/convert/eml/pdf",
      "/api/v1/convert/html/pdf",
    ]);
  });
});
