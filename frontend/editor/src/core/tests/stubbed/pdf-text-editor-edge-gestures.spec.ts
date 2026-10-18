import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { EditorTestWindow } from "@app/tests/stubbed/editorTestTypes";

/**
 * Direct manipulation: grab a box's frame to move it, or its right edge to
 * re-wrap it to a new width.
 *
 * The move gesture used to require Ctrl, which nothing on the page advertised -
 * the sidebar carried a permanent instruction card instead. Ctrl still works,
 * but the frame is now the discoverable path.
 */
const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

async function open(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SAMPLE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
}

interface Shape {
  x: number;
  y: number;
  width: number;
}

async function shapeOf(page: Page, src: string): Promise<Shape> {
  const out = await page.evaluate((needle: string) => {
    const run = (window as unknown as EditorTestWindow).__editor_store.doc
      .page(0)
      .runs.find((r) => new RegExp(needle).test(r.text));
    if (!run) return null;
    return {
      x: run.bounds.x,
      y: run.bounds.y,
      width: run.bounds.width,
    };
  }, src);
  if (!out) throw new Error(`run /${src}/ not found`);
  return out;
}

async function textOf(page: Page, needle: string): Promise<string> {
  return page.evaluate(
    (n: string) =>
      (window as unknown as EditorTestWindow).__editor_store.doc
        .page(0)
        .runs.find((r) => new RegExp(n).test(r.text))?.text ?? "",
    needle,
  );
}

async function boxOf(page: Page, src: string) {
  const id = await page.evaluate((needle: string) => {
    const run = (window as unknown as EditorTestWindow).__editor_store.doc
      .page(0)
      .runs.find((r) => new RegExp(needle).test(r.text));
    return run ? run.id : null;
  }, src);
  if (!id) throw new Error(`run /${src}/ not found`);
  const locator = page.locator(`[data-testid="pdf-editor-run-${id}"]`);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`run /${src}/ has no box`);
  return box;
}

test.describe("PDF text editor - edge gestures", () => {
  test("dragging the frame moves the box, with no modifier held", async ({
    page,
  }) => {
    await open(page);
    const before = await shapeOf(page, "Downloads");
    const box = await boxOf(page, "Downloads");

    // Grab the top edge - the frame, not the text interior.
    await page.mouse.move(box.x + box.width / 2, box.y + 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const after = await shapeOf(page, "Downloads");
    expect(
      Math.abs(after.x - before.x),
      "a frame drag must move the run on the page",
    ).toBeGreaterThan(5);
  });

  test("clicking the text interior still types instead of moving", async ({
    page,
  }) => {
    await open(page);
    const before = await shapeOf(page, "Downloads");
    const box = await boxOf(page, "Downloads");

    // Well inside the box: this is the caret, not a handle.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const after = await shapeOf(page, "Downloads");
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  });

  test("Ctrl+drag from the interior still moves, for existing muscle memory", async ({
    page,
  }) => {
    await open(page);
    const before = await shapeOf(page, "Downloads");
    const box = await boxOf(page, "Downloads");

    await page.keyboard.down("Control");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await page.keyboard.up("Control");
    await page.waitForTimeout(400);

    const after = await shapeOf(page, "Downloads");
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(5);
  });

  test("a left-frame drag never rewrites the run's text", async ({ page }) => {
    await open(page);
    const before = await textOf(page, "Open Source");
    const box = await boxOf(page, "Open Source");

    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);

    expect(await textOf(page, "Open Source")).toBe(before);
  });

  // A letter-spaced heading is drawn one glyph per object, which the reflow
  // used to read as one word per glyph and wrap into one character per line.
  test("a right-edge drag re-wraps between words, never inside them", async ({
    page,
  }) => {
    await open(page);
    const words = (text: string) => text.split(/\s+/).filter(Boolean);
    const before = await textOf(page, "Open Source");
    const box = await boxOf(page, "Open Source");

    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    await page.waitForTimeout(600);

    const after = await textOf(page, "Open");
    expect(after).toContain("\n");
    expect(words(after)).toEqual(words(before));
  });

  test("the insert verbs live in the toolbar, not the panel", async ({
    page,
  }) => {
    await open(page);
    const toolbar = page.getByTestId("pdf-editor-toolbar");
    await expect(toolbar.getByTestId("pdf-editor-add-text")).toBeVisible();
    await expect(toolbar.getByTestId("pdf-editor-add-image")).toBeVisible();
    await expect(
      page
        .locator('[data-sidebar="tool-panel"]')
        .getByTestId("pdf-editor-add-text"),
    ).toHaveCount(0);
  });
});
