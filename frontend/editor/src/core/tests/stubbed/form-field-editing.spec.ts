import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import { readFileSync } from "fs";
import path from "path";
import type { Page, Route } from "@playwright/test";

/**
 * Stubbed coverage for the form field editor (PR #5777 — create / modify /
 * delete fields, plus radio/button/signature/comb types). The backend
 * `/api/v1/form/*` endpoints are mocked so these specs run without a Spring
 * Boot server; they exercise the panel UI, the staged-change bookkeeping, and
 * that committing fires the combined `/edit-fields` endpoint with the right
 * payload.
 *
 * The real PDFBox round-trip is covered by the live spec and the backend
 * JUnit tests.
 */

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");
const PDF_BYTES = readFileSync(SAMPLE_PDF);

/** Two text fields on page 0, in the shape the backend emits. */
const STUB_FIELDS = [
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
  {
    name: "lastName",
    label: "Last name",
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
        y: 140,
        width: 180,
        height: 20,
        fontSize: 12,
        cropBoxHeight: 792,
      },
    ],
  },
];

/**
 * Install form-endpoint stubs. `fields` is what the extraction endpoint returns
 * (default: none, so create-mode drags land on an unobstructed overlay).
 * Returns a record of captured request bodies.
 */
async function stubFormEndpoints(page: Page, fields: unknown[] = []) {
  const captured: Record<string, string> = {};

  await page.route("**/api/v1/form/fields-with-coordinates", (route: Route) =>
    route.fulfill({ json: fields }),
  );

  // The UI routes create/modify/delete commits through the combined endpoint.
  await page.route("**/api/v1/form/edit-fields", (route: Route) => {
    captured["edit-fields"] = route.request().postData() ?? "";
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: PDF_BYTES,
    });
  });

  return captured;
}

async function openFormTool(page: Page) {
  await page.goto("/form-fill");
  await page.waitForLoadState("domcontentloaded");
  await uploadFiles(page, SAMPLE_PDF);
}

/** The Mantine SegmentedControl hides the radio input; the label is the target. */
function modeTab(page: Page, name: string) {
  return page
    .locator(".mantine-SegmentedControl-label")
    .filter({ hasText: name });
}

async function selectMode(page: Page, name: string) {
  await modeTab(page, name).click();
}

/**
 * Draw a rectangle on the create overlay for the currently-armed type, retrying
 * until a pending field registers (the commit button enables). Pointer drags
 * over the WASM-rendered page can occasionally drop under parallel load.
 */
async function drawField(page: Page) {
  const overlay = page.getByTestId("form-create-overlay-0");
  await expect(overlay).toBeVisible({ timeout: 30_000 });
  const commit = page.getByTestId("form-create-commit");
  for (let attempt = 0; attempt < 4; attempt++) {
    const box = await overlay.boundingBox();
    if (!box) continue;
    const startX = box.x + box.width * 0.25;
    const startY = box.y + box.height * 0.25;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY + 20, { steps: 4 });
    await page.mouse.move(startX + 120, startY + 40, { steps: 4 });
    await page.mouse.up();
    try {
      await expect(commit).toBeEnabled({ timeout: 2000 });
      return;
    } catch {
      // drag dropped under load — try again
    }
  }
}

test.describe("Form field editor", () => {
  test("exposes Fill / Create / Modify modes", async ({ page }) => {
    await stubFormEndpoints(page);
    await openFormTool(page);

    await expect(modeTab(page, "Fill")).toBeVisible();
    await expect(modeTab(page, "Create")).toBeVisible();
    await expect(modeTab(page, "Modify")).toBeVisible();
  });

  test("create mode: palette offers every creatable type", async ({ page }) => {
    await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");

    for (const type of [
      "text",
      "checkbox",
      "combobox",
      "listbox",
      "radio",
      "button",
      "signature",
    ]) {
      await expect(page.getByTestId(`form-create-type-${type}`)).toBeVisible();
    }

    // Commit disabled with nothing queued.
    await expect(page.getByTestId("form-create-commit")).toBeDisabled();

    // Arming a type reveals the "draw on the page" hint.
    await page.getByTestId("form-create-type-text").click();
    await expect(
      page.getByText(/Draw a Text field on the page/i),
    ).toBeVisible();
  });

  test("create mode: drawing a text field commits via /edit-fields", async ({
    page,
  }) => {
    const captured = await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");
    await page.getByTestId("form-create-type-text").click();
    await drawField(page);

    // A queued field appears with a commit affordance enabled.
    await expect(page.getByTestId("form-create-commit")).toBeEnabled();

    await page.getByTestId("form-create-commit").click();
    await expect.poll(() => captured["edit-fields"]).toBeTruthy();
    expect(captured["edit-fields"]).toContain('"add"');
    expect(captured["edit-fields"]).toContain('"type":"text"');
  });

  test("create mode: drawing a radio field commits a radio definition", async ({
    page,
  }) => {
    const captured = await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");
    await page.getByTestId("form-create-type-radio").click();
    await drawField(page);

    await expect(page.getByTestId("form-create-commit")).toBeEnabled();
    await page.getByTestId("form-create-commit").click();

    await expect.poll(() => captured["edit-fields"]).toBeTruthy();
    expect(captured["edit-fields"]).toContain('"type":"radio"');
  });

  test("create mode: a choice field auto-shows seeded options", async ({
    page,
  }) => {
    await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");
    await page.getByTestId("form-create-type-listbox").click();
    await drawField(page);

    // The just-drawn field's property editor auto-expands and the Options
    // section is visible immediately, pre-seeded with two options — no manual
    // expand, no hunting at the bottom of the panel.
    await expect(page.getByText("Options", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Option 1")).toHaveValue("Option 1");
    await expect(page.getByPlaceholder("Option 2")).toHaveValue("Option 2");
  });

  test("create mode: signature field explains it is a placeholder", async ({
    page,
  }) => {
    await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");
    await page.getByTestId("form-create-type-signature").click();
    await drawField(page);

    // The editor makes clear you don't sign here - it's a placeholder a signer fills.
    await expect(page.getByText(/Placeholder only/i)).toBeVisible();
  });

  test("modify mode: lists fields and deletes one via /edit-fields", async ({
    page,
  }) => {
    const captured = await stubFormEndpoints(page, STUB_FIELDS);
    await openFormTool(page);

    await selectMode(page, "Modify");

    // Both stubbed fields render as rows.
    await expect(page.getByTestId("form-modify-row-firstName")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("form-modify-row-lastName")).toBeVisible();

    // Mark one for deletion → commit count reflects it and button enables.
    await page.getByTestId("form-modify-delete-firstName").click();
    const commit = page.getByTestId("form-modify-commit");
    await expect(commit).toContainText("1");
    await expect(commit).toBeEnabled();

    await commit.click();
    await expect.poll(() => captured["edit-fields"]).toBeTruthy();
    expect(captured["edit-fields"]).toContain('"delete"');
    expect(captured["edit-fields"]).toContain("firstName");
  });

  test("modify mode: editing a property commits via /edit-fields", async ({
    page,
  }) => {
    const captured = await stubFormEndpoints(page, STUB_FIELDS);
    await openFormTool(page);

    await selectMode(page, "Modify");
    await page.getByTestId("form-modify-row-firstName").click();

    // The property editor reveals the label input; change it.
    const labelInput = page.getByLabel("Label").first();
    await expect(labelInput).toBeVisible();
    await labelInput.fill("Given name");

    const commit = page.getByTestId("form-modify-commit");
    await expect(commit).toBeEnabled();
    await commit.click();

    await expect.poll(() => captured["edit-fields"]).toBeTruthy();
    expect(captured["edit-fields"]).toContain('"modify"');
    expect(captured["edit-fields"]).toContain("firstName");
    expect(captured["edit-fields"]).toContain("Given name");
  });
});
