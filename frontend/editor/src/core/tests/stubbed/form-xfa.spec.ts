import fs from "node:fs";
import os from "node:os";
import path from "path";
import {
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFString,
} from "@cantoo/pdf-lib";
import type { Page, Route } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";

/**
 * Hybrid XFA forms (Adobe LiveCycle) with `/api/v1/form/*` mocked: the warning, the save-mode
 * choice, and which request each save path makes. The sync itself lives in the JUnit tests.
 */

const FORM_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/form-fields-sample.pdf",
);

/**
 * The form-fields fixture with an XFA packet added, which is all PDFium looks at to call a form
 * hybrid, or dynamic once NeedsRendering is set. pdf-lib's getForm() would delete the packet, so
 * it is added through the low-level catalog instead.
 */
async function xfaFixture(kind: "hybrid" | "dynamic"): Promise<string> {
  const document = await PDFDocument.load(fs.readFileSync(FORM_PDF));
  const acroForm = document.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
  const template = document.context.flateStream(
    '<template xmlns="http://www.xfa.org/schema/xfa-template/3.3/">' +
      '<subform name="form1"/></template>',
  );
  acroForm.set(
    PDFName.of("XFA"),
    document.context.obj([
      PDFString.of("template"),
      document.context.register(template),
    ]),
  );
  if (kind === "dynamic") {
    document.catalog.set(PDFName.of("NeedsRendering"), PDFBool.True);
  }
  const file = path.join(
    os.tmpdir(),
    `stirling-xfa-${kind}-${process.pid}.pdf`,
  );
  fs.writeFileSync(
    file,
    await document.save({ updateFieldAppearances: false }),
  );
  return file;
}

async function openInViewer(page: Page, file: string) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
}

async function typeIntoFirstField(page: Page) {
  const field = page
    .locator('[data-page-index="0"] input[type="text"]')
    .first();
  await expect(field).toBeVisible({ timeout: 20_000 });
  await field.fill("updated value");
  await page.keyboard.press("Tab");
}

/** A text part as the browser sends it, which Playwright reads back on every engine. */
function textPart(name: string, value: string) {
  return new RegExp(`name="${name}"\\r?\\n\\r?\\n${value}\\r?\\n`);
}

test.describe("Hybrid XFA forms", () => {
  test("the viewer warns about the XFA and syncs it when changes are applied", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const file = await xfaFixture("hybrid");
    let syncRequest = "";
    await page.route("**/api/v1/form/xfa-sync", (route: Route) => {
      syncRequest = route.request().postData() ?? "";
      route.fulfill({
        json: {
          action: "synced",
          usageRightsRemoved: false,
          counts: {},
          warnings: [],
          pdf: fs.readFileSync(file).toString("base64"),
        },
      });
    });

    await openInViewer(page, file);
    await expect(page.getByTestId("xfa-notice")).toBeVisible({
      timeout: 30_000,
    });
    await typeIntoFirstField(page);
    await page.getByRole("button", { name: "Apply Changes" }).first().click();

    await expect
      .poll(() => syncRequest, { timeout: 30_000 })
      .toMatch(textPart("mode", "sync"));
  });

  test("a failed XFA sync keeps the saved PDF and says so", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const file = await xfaFixture("hybrid");
    await page.route("**/api/v1/form/xfa-sync", (route: Route) =>
      route.fulfill({ status: 500, json: { detail: "boom" } }),
    );

    await openInViewer(page, file);
    await expect(page.getByTestId("xfa-notice")).toBeVisible({
      timeout: 30_000,
    });
    await typeIntoFirstField(page);
    await page.getByRole("button", { name: "Apply Changes" }).first().click();

    await expect(page.getByTestId("xfa-sync-failed").first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("the form editor sends the chosen XFA mode with the fill", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const file = await xfaFixture("hybrid");
    let fillRequest = "";
    await page.route("**/api/v1/form/fields-with-coordinates", (route: Route) =>
      route.fulfill({
        json: [
          {
            name: "firstName",
            label: "First name",
            type: "text",
            value: "",
            options: null,
            displayOptions: null,
            required: false,
            readOnly: false,
            multiSelect: false,
            multiline: false,
            tooltip: null,
            widgets: [
              {
                pageIndex: 0,
                x: 100,
                y: 100,
                width: 180,
                height: 20,
                fontSize: 12,
                cropBoxHeight: 792,
              },
            ],
          },
        ],
      }),
    );
    await page.route("**/api/v1/form/fill", (route: Route) => {
      fillRequest = route.request().postData() ?? "";
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: fs.readFileSync(file),
      });
    });

    await page.goto("/form-fill");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('input[type="file"]').first().setInputFiles(file);
    const notice = page.getByTestId("xfa-notice").first();
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await notice.getByText("Remove XFA", { exact: true }).click();
    const input = page.getByLabel("First name").first();
    await expect(input).toBeVisible({ timeout: 20_000 });
    await input.fill("Ada");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect
      .poll(() => fillRequest, { timeout: 30_000 })
      .toMatch(textPart("xfaMode", "strip"));
  });

  test("a dynamic XFA form says only Acrobat can fill it", async ({ page }) => {
    test.setTimeout(300_000);
    await openInViewer(page, await xfaFixture("dynamic"));

    await expect(page.getByTestId("xfa-notice-dynamic").first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
