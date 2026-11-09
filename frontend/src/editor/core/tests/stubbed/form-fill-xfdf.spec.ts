import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";
import type { Page } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

/**
 * Stubbed coverage for the Form Fill tool's XFDF / FDF exchange.
 *
 * These are Acrobat's interchange formats for form *values*, so this is the
 * seam that lets an Acrobat-based forms workflow move over: import an
 * existing export, or hand a filled form back to a process that expects
 * XFDF.
 *
 * The field list normally comes from the PDFBox backend; here
 * `/api/v1/form/fields-with-coordinates` is stubbed so the flow runs without
 * a server.
 */

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

const FIELDS = [
  {
    name: "FullName",
    label: "Full name",
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
      { pageIndex: 0, x: 100, y: 100, width: 200, height: 20, fontSize: 10 },
    ],
  },
  {
    name: "Address.Street",
    label: "Street",
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
      { pageIndex: 0, x: 100, y: 140, width: 200, height: 20, fontSize: 10 },
    ],
  },
  {
    name: "Languages",
    label: "Languages",
    type: "listbox",
    value: "",
    options: ["English", "French", "German"],
    displayOptions: null,
    required: false,
    readOnly: false,
    multiSelect: true,
    multiline: false,
    tooltip: null,
    widgets: [
      { pageIndex: 0, x: 100, y: 180, width: 200, height: 40, fontSize: 10 },
    ],
  },
];

/** A real-shaped Acrobat XFDF export, including a field this PDF lacks. */
const XFDF = `<?xml version="1.0" encoding="UTF-8"?>
<xfdf xmlns="http://ns.adobe.com/xfdf/" xml:space="preserve">
  <f href="sample.pdf"/>
  <fields>
    <field name="FullName"><value>Ada Lovelace</value></field>
    <field name="Address">
      <field name="Street"><value>1 High Street</value></field>
    </field>
    <field name="Languages">
      <value>English</value>
      <value>French</value>
    </field>
    <field name="NotInThisPdf"><value>ignored</value></field>
  </fields>
</xfdf>
`;

async function openFormFill(page: Page): Promise<void> {
  await page.route("**/api/v1/form/fields-with-coordinates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FIELDS),
    }),
  );
  await page.goto("/form-fill");
  await page.waitForLoadState("domcontentloaded");
  await uploadFiles(page, SAMPLE_PDF);
  // The panel only renders its actions once the field fetch resolves.
  await expect(
    page.getByRole("button", { name: /Import form data/i }),
  ).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("Form Fill - XFDF / FDF exchange", () => {
  test("importing an XFDF export fills the matching fields and reports the rest", async ({
    page,
  }) => {
    await openFormFill(page);

    await page.locator('input[type="file"][accept*="xfdf"]').setInputFiles({
      name: "export.xfdf",
      mimeType: "application/vnd.adobe.xfdf",
      buffer: Buffer.from(XFDF),
    });

    // Three of the four fields exist in this document. The two counts
    // pluralise independently: "3 fields" imported, "1 field" skipped.
    await expect(
      page.getByText(
        /Imported 3 fields from XFDF\. 1 field is not in this PDF: NotInThisPdf/,
      ),
    ).toBeVisible({ timeout: 10_000 });

    // Values reached the form store: the panel's progress counter moves and
    // the text input shows the imported value.
    await expect(page.getByText("3 / 3 filled")).toBeVisible();
    await expect(
      page.locator('input[value="Ada Lovelace"]').first(),
    ).toBeVisible();
  });

  test("a filled form exports as XFDF", async ({ page }) => {
    await openFormFill(page);

    await page.locator('input[type="file"][accept*="xfdf"]').setInputFiles({
      name: "export.xfdf",
      mimeType: "application/vnd.adobe.xfdf",
      buffer: Buffer.from(XFDF),
    });
    await expect(page.getByText(/Imported 3 fields from XFDF/)).toBeVisible({
      timeout: 10_000,
    });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Export as XFDF/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.xfdf$/);
  });

  test("an unrecognised data file is rejected with a readable message", async ({
    page,
  }) => {
    await openFormFill(page);

    await page.locator('input[type="file"][accept*="xfdf"]').setInputFiles({
      name: "notes.xfdf",
      mimeType: "application/vnd.adobe.xfdf",
      buffer: Buffer.from('{"FullName":"Ada"}'),
    });

    await expect(page.getByText(/Unrecognised form data file/)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("malformed XML reports the parser message without the browser's page wrapper", async ({
    page,
  }) => {
    await openFormFill(page);

    await page.locator('input[type="file"][accept*="xfdf"]').setInputFiles({
      name: "broken.xfdf",
      mimeType: "application/vnd.adobe.xfdf",
      buffer: Buffer.from(
        '<?xml version="1.0"?>\n<xfdf xmlns="http://ns.adobe.com/xfdf/"><fields>',
      ),
    });

    const error = page.getByText(/File is not valid XML/);
    await expect(error).toBeVisible({ timeout: 10_000 });
    await expect(error).not.toContainText("This page contains");
  });

  test("a file that matches no field in this PDF is shown as a warning", async ({
    page,
  }) => {
    await openFormFill(page);

    await page.locator('input[type="file"][accept*="xfdf"]').setInputFiles({
      name: "other-form.xfdf",
      mimeType: "application/vnd.adobe.xfdf",
      buffer: Buffer.from(
        '<xfdf xmlns="http://ns.adobe.com/xfdf/"><fields><field name="Surname"><value>x</value></field></fields></xfdf>',
      ),
    });

    const summary = page.getByTestId("form-import-summary");
    await expect(summary).toContainText(
      "Imported 0 fields from XFDF. 1 field is not in this PDF: Surname",
      { timeout: 10_000 },
    );
    await expect(summary.locator(".mantine-Alert-icon")).toBeVisible();
  });

  test("the import summary clears once the form is saved", async ({ page }) => {
    await page.route("**/api/v1/form/fill", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: readFileSync(SAMPLE_PDF),
      }),
    );
    await openFormFill(page);

    await page.locator('input[type="file"][accept*="xfdf"]').setInputFiles({
      name: "export.xfdf",
      mimeType: "application/vnd.adobe.xfdf",
      buffer: Buffer.from(XFDF),
    });
    await expect(page.getByTestId("form-import-summary")).toBeVisible({
      timeout: 10_000,
    });

    const fill = page.waitForRequest("**/api/v1/form/fill");
    await page.getByRole("button", { name: /^Save$/ }).click();
    await fill;

    await expect(page.getByTestId("form-import-summary")).toHaveCount(0);
  });

  test("importing over a typed value asks before replacing it", async ({
    page,
  }) => {
    await openFormFill(page);
    const fullName = page.getByRole("textbox").first();
    await fullName.fill("Typed by me");

    const importXfdf = () =>
      page.locator('input[type="file"][accept*="xfdf"]').setInputFiles({
        name: "export.xfdf",
        mimeType: "application/vnd.adobe.xfdf",
        buffer: Buffer.from(XFDF),
      });

    await importXfdf();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Replace 1 value you entered?");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(fullName).toHaveValue("Typed by me");
    await expect(page.getByTestId("form-import-summary")).toHaveCount(0);

    await importXfdf();
    await dialog.getByRole("button", { name: "Replace" }).click();
    await expect(fullName).toHaveValue("Ada Lovelace");
    await expect(page.getByTestId("form-import-summary")).toBeVisible();

    await importXfdf();
    await expect(page.getByTestId("form-import-summary")).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  test("the import summary can be closed", async ({ page }) => {
    await openFormFill(page);

    await page.locator('input[type="file"][accept*="xfdf"]').setInputFiles({
      name: "export.xfdf",
      mimeType: "application/vnd.adobe.xfdf",
      buffer: Buffer.from(XFDF),
    });
    const summary = page.getByTestId("form-import-summary");
    await expect(summary).toBeVisible({ timeout: 10_000 });

    await summary.getByRole("button", { name: "Close" }).click();
    await expect(summary).toHaveCount(0);
    await expect(page.getByText("3 / 3 filled")).toBeVisible();
  });
});
