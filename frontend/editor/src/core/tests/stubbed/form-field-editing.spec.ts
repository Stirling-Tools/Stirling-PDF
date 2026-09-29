import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import {
  captureMultipartPart,
  readCapturedPart,
} from "@app/tests/helpers/multipart-capture";
import { readFileSync } from "fs";
import path from "path";
import type { Page, Route } from "@playwright/test";
import type { FieldEditBatch } from "@app/tools/formFill/types";

/**
 * Form field editor with `/api/v1/form/*` mocked: panel UI, staged-change bookkeeping and the
 * committed `/edit-fields` payload. The PDFBox round-trip lives in the live spec and JUnit tests.
 */

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
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

const EDIT_FIELDS_PATH = "/api/v1/form/edit-fields";

/**
 * Stubs the form endpoints; `fields` is what extraction returns (default none, so create-mode
 * drags land on an unobstructed overlay). Returns captured multipart envelopes (part headers only).
 */
async function stubFormEndpoints(page: Page, fields: unknown[] = []) {
  const captured: Record<string, string> = {};

  // The edits JSON is a Blob part, whose body Playwright cannot read back on
  // WebKit; capture it in-page instead. Must be installed before navigation.
  await captureMultipartPart(page, "edits");

  await page.route("**/api/v1/form/fields-with-coordinates", (route: Route) =>
    route.fulfill({ json: fields }),
  );

  // Trailing ** so the glob still matches once a query string is appended.
  await page.route("**/api/v1/form/edit-fields**", (route: Route) => {
    captured["edit-fields"] = route.request().postData() ?? "";
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: PDF_BYTES,
    });
  });

  return captured;
}

/**
 * Asserts the multipart envelope on the wire: part headers read on every engine (only Blob part
 * bodies are elided on WebKit), and this is the shape the backend's `@RequestPart` binding needs.
 */
function expectEditFieldsEnvelope(envelope: string) {
  expect(envelope).toContain('name="file"');
  expect(envelope).toContain('filename="sample.pdf"');
  expect(envelope).toContain('name="edits"');
  expect(envelope).toMatch(/content-type:\s*application\/json/i);
}

/** The parsed `edits` JSON the app posted to /edit-fields. */
async function readEditBatch(page: Page): Promise<FieldEditBatch> {
  await expect
    .poll(() => readCapturedPart(page, EDIT_FIELDS_PATH))
    .toBeTruthy();
  const json = await readCapturedPart(page, EDIT_FIELDS_PATH);
  return JSON.parse(json as string) as FieldEditBatch;
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
 * Draws on the create overlay, retrying until the commit button enables: pointer drags over the
 * WASM-rendered page can drop under parallel load.
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
      // drag dropped under load - try again
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

    const batch = await readEditBatch(page);
    expect(batch.add).toHaveLength(1);
    expect(batch.add?.[0]?.type).toBe("text");
    // The drawn rectangle, not a degenerate one - guards the drag geometry.
    expect(batch.add?.[0]?.pageIndex).toBe(0);
    expect(batch.add?.[0]?.width).toBeGreaterThan(0);
    expect(batch.add?.[0]?.height).toBeGreaterThan(0);

    await expect.poll(() => captured["edit-fields"]).toBeTruthy();
    expectEditFieldsEnvelope(captured["edit-fields"]);

    // Committing clears the queue, so there is nothing left to add.
    await expect(page.getByTestId("form-create-commit")).toBeDisabled();
  });

  test("create mode: a drawn field is selected and can be resized straight away", async ({
    page,
  }) => {
    await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");
    await page.getByTestId("form-create-type-text").click();
    await drawField(page);

    // Selected on placement, so the resize handles are live without another click.
    const box = page.locator('[data-testid^="form-edit-field-pending-"]');
    await expect(box).toHaveCount(1);
    // WebKit paints a beat after the element exists, so measure only once it is visible.
    await expect(box).toBeVisible();
    const before = await box.boundingBox();
    expect(before).not.toBeNull();

    const handle = page.getByTestId("form-edit-handle-se");
    await expect(handle).toBeVisible();
    // hover() waits for actionability and centres on the grip; a hand-computed point
    // intermittently misses a 9px target once the layout shifts under it.
    await handle.hover();
    const grip = await handle.boundingBox();
    expect(grip).not.toBeNull();
    await page.mouse.down();
    await page.mouse.move(grip!.x + 80, grip!.y + 50, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () => (await box.boundingBox())?.width ?? 0)
      .toBeGreaterThan(before!.width + 20);
  });

  test("create mode: drawing a field shows one box, and moving it leaves none behind", async ({
    page,
  }) => {
    await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");
    await page.getByTestId("form-create-type-text").click();
    await drawField(page);

    // Measures geometry rather than hit-testing: the duplicate box was pointer-events:none,
    // so elementsFromPoint skipped it and the bug sailed through. Counts every bordered box any
    // overlay draws over the point.
    const boxesAt = ([x, y]: [number, number]) =>
      page.evaluate(
        ([px, py]) =>
          Array.from(
            document.querySelectorAll(
              '[data-testid^="form-create-overlay-"] div, [data-testid^="form-edit-overlay-"] div',
            ),
          ).filter((el) => {
            const style = getComputedStyle(el);
            // The field box is drawn with an outline, not a border, so that its border does not
            // indent the content box and push the field preview inside it out of alignment.
            const framed =
              style.borderStyle !== "none" || style.outlineStyle !== "none";
            if (!framed || style.display === "none") {
              return false;
            }
            const r = el.getBoundingClientRect();
            // Ignore the resize grips, which are far smaller than any field box.
            if (r.width < 12 || r.height < 12) return false;
            return (
              px >= r.left && px <= r.right && py >= r.top && py <= r.bottom
            );
          }).length,
        [x, y],
      );

    const box = page
      .locator('[data-testid^="form-edit-field-pending-"]')
      .first();
    // WebKit paints a beat after the element exists, so measure only once it is visible.
    await expect(box).toBeVisible();
    const before = await box.boundingBox();
    expect(before).not.toBeNull();
    const origin: [number, number] = [
      before!.x + before!.width / 2,
      before!.y + before!.height / 2,
    ];

    await expect.poll(() => boxesAt(origin)).toBe(1);

    await page.mouse.move(origin[0], origin[1]);
    await page.mouse.down();
    await page.mouse.move(origin[0] + 90, origin[1] + 60, { steps: 10 });
    await page.mouse.up();

    const after = await box.boundingBox();
    expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(20);
    // Nothing left behind where it used to be.
    expect(await boxesAt(origin)).toBe(0);
  });

  test("create mode: Delete removes the drawn field before it is applied", async ({
    page,
  }) => {
    await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");
    await page.getByTestId("form-create-type-text").click();
    await drawField(page);

    await expect(
      page.locator('[data-testid^="form-edit-field-pending-"]'),
    ).toHaveCount(1);

    await page.keyboard.press("Delete");

    await expect(
      page.locator('[data-testid^="form-edit-field-pending-"]'),
    ).toHaveCount(0);
    // Nothing queued means nothing to apply.
    await expect(page.getByTestId("form-create-commit")).toBeDisabled();
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

    const batch = await readEditBatch(page);
    expect(batch.add).toHaveLength(1);
    expect(batch.add?.[0]?.type).toBe("radio");
    expect(batch.add?.[0]?.options).toEqual(["Option 1", "Option 2"]);

    await expect.poll(() => captured["edit-fields"]).toBeTruthy();
    expectEditFieldsEnvelope(captured["edit-fields"]);
  });

  test("create mode: a choice field auto-shows seeded options", async ({
    page,
  }) => {
    await stubFormEndpoints(page);
    await openFormTool(page);

    await selectMode(page, "Create");
    await page.getByTestId("form-create-type-listbox").click();
    await drawField(page);

    // The just-drawn field's property editor auto-expands with Options
    // pre-seeded, so no manual expand is needed.
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

    const batch = await readEditBatch(page);
    expect(batch.delete).toEqual(["firstName"]);
    // A field queued for deletion is not also sent as a modification.
    expect(batch.modify ?? []).toHaveLength(0);

    await expect.poll(() => captured["edit-fields"]).toBeTruthy();
    expectEditFieldsEnvelope(captured["edit-fields"]);

    // The staged deletion is cleared once it has been saved.
    await expect(commit).toBeDisabled();
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

    const batch = await readEditBatch(page);
    expect(batch.modify).toHaveLength(1);
    expect(batch.modify?.[0]?.targetName).toBe("firstName");
    expect(batch.modify?.[0]?.label).toBe("Given name");
    expect(batch.delete ?? []).toHaveLength(0);

    await expect.poll(() => captured["edit-fields"]).toBeTruthy();
    expectEditFieldsEnvelope(captured["edit-fields"]);

    await expect(commit).toBeDisabled();
  });
});
