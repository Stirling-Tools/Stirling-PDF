import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import type { Page } from "@playwright/test";
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

test.describe("Form Fill — XFDF / FDF exchange", () => {
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
});
