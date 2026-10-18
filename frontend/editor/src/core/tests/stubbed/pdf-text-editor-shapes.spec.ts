import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

/**
 * Vector shapes: what a delete or move leaves in the SAVED file, not just on
 * screen. PDFium writes back a form XObject child's removal but not its new
 * paint or position, so shapes inside a form are deleted at save time and are
 * not movable; the sample keeps most of its shapes in one such form.
 */
const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ShapeInfo {
  id: string;
  grouped: boolean;
  bounds: Rect;
}

interface ShapeWindow {
  __editor_store: {
    doc: {
      page(i: number): {
        shapes: { id: string; containerPtr: number; bounds: Rect }[];
      };
    };
    selection: { selectShape(id: string): void };
  };
}

type PdfFile = string | { name: string; mimeType: string; buffer: Buffer };

async function openPdf(page: Page, file: PdfFile): Promise<void> {
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
}

async function openSample(page: Page): Promise<void> {
  await page.route("**/encode-charcodes", (route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openPdf(page, SAMPLE);
}

async function saveAndReopen(page: Page): Promise<void> {
  const download = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-download").click();
  const stream = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  await openPdf(page, {
    name: "round-trip.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat(chunks),
  });
}

function shapes(page: Page): Promise<ShapeInfo[]> {
  return page.evaluate(() =>
    (window as unknown as ShapeWindow).__editor_store.doc
      .page(0)
      .shapes.map((s) => ({
        id: s.id,
        grouped: s.containerPtr !== 0,
        bounds: { ...s.bounds },
      })),
  );
}

/** Ids change across a reopen, so a shape is matched by where it is drawn. */
function drawnAt(list: ShapeInfo[], r: Rect, dx = 0): boolean {
  return list.some(
    (s) =>
      Math.abs(s.bounds.x - (r.x + dx)) < 0.6 &&
      Math.abs(s.bounds.y - r.y) < 0.6 &&
      Math.abs(s.bounds.width - r.width) < 0.6 &&
      Math.abs(s.bounds.height - r.height) < 0.6,
  );
}

/** True when no other shape is drawn at the same place, so `drawnAt` is unambiguous. */
function isUnique(list: ShapeInfo[], shape: ShapeInfo): boolean {
  return list.filter((s) => drawnAt([s], shape.bounds)).length === 1;
}

async function deleteShape(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (shapeId) =>
      (window as unknown as ShapeWindow).__editor_store.selection.selectShape(
        shapeId,
      ),
    id,
  );
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(500);
}

/** A point on the shape's overlay that nothing else covers. */
async function grabPoint(
  page: Page,
  id: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((shapeId) => {
    const el = document.querySelector(
      `[data-testid="pdf-editor-shape-${shapeId}"]`,
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let fx = 0.05; fx < 1; fx += 0.15) {
      for (let fy = 0.05; fy < 1; fy += 0.15) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        if (document.elementFromPoint(x, y) === el) return { x, y };
      }
    }
    return null;
  }, id);
}

async function dragBy(
  page: Page,
  from: { x: number; y: number },
  dx: number,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function largestGrouped(page: Page): Promise<ShapeInfo> {
  const all = await shapes(page);
  const grouped = all.filter((s) => s.grouped && isUnique(all, s));
  expect(
    grouped.length,
    "the sample keeps shapes inside a form",
  ).toBeGreaterThan(0);
  return grouped.sort(
    (a, b) =>
      b.bounds.width * b.bounds.height - a.bounds.width * a.bounds.height,
  )[0];
}

async function grabbable(
  page: Page,
  grouped: boolean,
): Promise<{ shape: ShapeInfo; at: { x: number; y: number } }> {
  const all = await shapes(page);
  for (const shape of all) {
    if (shape.grouped !== grouped || !isUnique(all, shape)) continue;
    const at = await grabPoint(page, shape.id);
    if (at) return { shape, at };
  }
  throw new Error(`no uncovered ${grouped ? "grouped" : "page"} shape`);
}

test.describe("PDF text editor - vector shapes survive save", () => {
  test("a deleted shape inside a form is gone from the saved file", async ({
    page,
  }) => {
    await openSample(page);
    const target = await largestGrouped(page);
    await deleteShape(page, target.id);
    expect(drawnAt(await shapes(page), target.bounds)).toBe(false);

    await saveAndReopen(page);
    expect(drawnAt(await shapes(page), target.bounds)).toBe(false);
  });

  test("an undone delete inside a form keeps the shape in the saved file", async ({
    page,
  }) => {
    await openSample(page);
    const target = await largestGrouped(page);
    await deleteShape(page, target.id);
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(500);

    await saveAndReopen(page);
    expect(drawnAt(await shapes(page), target.bounds)).toBe(true);
  });

  test("undoing a delete after the save that removed it brings the shape back", async ({
    page,
  }) => {
    await openSample(page);
    const target = await largestGrouped(page);
    await deleteShape(page, target.id);
    const download = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    await download;
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(500);
    expect(drawnAt(await shapes(page), target.bounds)).toBe(true);

    await saveAndReopen(page);
    expect(drawnAt(await shapes(page), target.bounds)).toBe(true);
  });

  test("a shape inside a form does not move", async ({ page }) => {
    await openSample(page);
    const { shape, at } = await grabbable(page, true);
    await dragBy(page, at, 45);
    expect(drawnAt(await shapes(page), shape.bounds)).toBe(true);
  });

  test("a page-level shape's move and delete are in the saved file", async ({
    page,
  }) => {
    await openSample(page);
    const { shape: moved, at } = await grabbable(page, false);
    await dragBy(page, at, 45);
    const after = (await shapes(page)).find((s) => s.id === moved.id);
    const dx = (after?.bounds.x ?? moved.bounds.x) - moved.bounds.x;
    expect(Math.abs(dx)).toBeGreaterThan(5);
    const current = await shapes(page);
    const removed = current.find(
      (s) => !s.grouped && s.id !== moved.id && isUnique(current, s),
    );
    expect(removed, "the sample has a second page-level shape").toBeDefined();
    await deleteShape(page, removed!.id);

    await saveAndReopen(page);
    const reopened = await shapes(page);
    expect(drawnAt(reopened, moved.bounds, dx)).toBe(true);
    expect(drawnAt(reopened, removed!.bounds)).toBe(false);
  });
});
