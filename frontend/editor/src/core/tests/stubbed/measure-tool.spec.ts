import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const POINTS_PER_MM = 72 / 25.4;

interface StoredPoint {
  x: number;
  y: number;
}

async function storedLines(page: Page): Promise<StoredPoint[][]> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("stirling_measurements");
    const byFile = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const lists = Object.values(byFile) as { points: StoredPoint[] }[][];
    return (lists[0] ?? []).map((m) => m.points);
  });
}

async function openMeasureTool(page: Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Ruler / Measure" }).click();
  await expect(page.getByText("Click to start a line.")).toBeVisible();
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Sample page has no bounding box");
  return box;
}

test("lines snap to angles, chain from endpoints and align with each other", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const box = await openMeasureTool(page);
  const at = (fx: number, fy: number) =>
    [box.x + box.width * fx, box.y + box.height * fy] as const;

  // Slightly off horizontal: the angle snap flattens it.
  await page.mouse.click(...at(0.2, 0.3));
  await page.mouse.click(at(0.6, 0.3)[0], at(0.6, 0.3)[1] + 3);
  await expect.poll(async () => (await storedLines(page)).length).toBe(1);
  const [first] = await storedLines(page);
  expect(first[1].y).toBeCloseTo(first[0].y, 6);

  // Starting on the first line's end chains a new line from that exact point.
  await page.mouse.click(...at(0.6, 0.3));
  await page.mouse.click(at(0.6, 0.45)[0] + 4, at(0.6, 0.45)[1]);
  await expect.poll(async () => (await storedLines(page)).length).toBe(2);
  const second = (await storedLines(page))[1];
  expect(second[0]).toEqual(first[1]);
  expect(second[1].x).toBeCloseTo(second[0].x, 6);

  // A parallel line below snaps its ends into line with the first line's.
  await page.mouse.click(at(0.2, 0.6)[0] + 3, at(0.2, 0.6)[1]);
  await page.mouse.click(at(0.6, 0.6)[0] - 3, at(0.6, 0.6)[1] + 2);
  await expect.poll(async () => (await storedLines(page)).length).toBe(3);
  const third = (await storedLines(page))[2];
  expect(third[0].x).toBeCloseTo(first[0].x, 6);
  expect(third[1].x).toBeCloseTo(first[1].x, 6);
  expect(third[1].y).toBeCloseTo(third[0].y, 6);
});

test("the inspector redraws the line as values are typed", async ({ page }) => {
  test.setTimeout(120_000);
  const box = await openMeasureTool(page);

  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.3);
  await expect.poll(async () => (await storedLines(page)).length).toBe(1);

  const length = page.getByRole("textbox", { name: "Length" });
  await length.fill("100");
  await expect
    .poll(async () => {
      const [[a, b]] = await storedLines(page);
      return Math.hypot(b.x - a.x, b.y - a.y) / POINTS_PER_MM;
    })
    .toBeCloseTo(100, 3);

  const angle = page.getByRole("textbox", { name: "Angle" });
  await angle.fill("90");
  await expect
    .poll(async () => {
      const [[a, b]] = await storedLines(page);
      return { dx: b.x - a.x, up: a.y - b.y };
    })
    .toEqual({
      dx: expect.closeTo(0, 6),
      up: expect.closeTo(100 * POINTS_PER_MM, 3),
    });
});

test("with snapping off, lines stay where they are drawn", async ({ page }) => {
  test.setTimeout(120_000);
  const box = await openMeasureTool(page);
  await page.getByRole("button", { name: "Snapping and display" }).click();
  await page.getByText("Snap to points and guides").click();
  await page.getByText("Snap angles to 45° and 90°").click();

  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.3 + 4);
  await expect.poll(async () => (await storedLines(page)).length).toBe(1);
  const [[a, b]] = await storedLines(page);
  expect(Math.abs(b.y - a.y)).toBeGreaterThan(1);
});

async function clickPath(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  points: [number, number][],
) {
  for (const [fx, fy] of points) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  }
}

test("Esc and the Finish button keep a path's points", async ({ page }) => {
  test.setTimeout(120_000);
  const box = await openMeasureTool(page);
  await page.getByText("Path", { exact: true }).click();

  await clickPath(page, box, [
    [0.2, 0.3],
    [0.4, 0.35],
    [0.5, 0.5],
  ]);
  await page.keyboard.press("Escape");
  await expect.poll(async () => (await storedLines(page)).length).toBe(1);
  expect((await storedLines(page))[0]).toHaveLength(3);

  await clickPath(page, box, [
    [0.2, 0.7],
    [0.45, 0.75],
  ]);
  await page.getByRole("button", { name: "Finish path" }).click();
  await expect.poll(async () => (await storedLines(page)).length).toBe(2);
  expect((await storedLines(page))[1]).toHaveLength(2);
});

test("scales can be set from a preset or typed in the custom cell", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openMeasureTool(page);
  const storedRatio = () =>
    page.evaluate(() => {
      const raw = sessionStorage.getItem("stirling_scales");
      const byFile = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const scales = Object.values(byFile)[0] as
        | { defaultScale: { ratio: number } | null }
        | undefined;
      return scales?.defaultScale?.ratio ?? null;
    });

  await page.getByRole("button", { name: "Set scale" }).click();
  const custom = page.getByRole("textbox", { name: "Custom scale" });
  await custom.fill("250");
  await custom.press("Enter");
  await expect.poll(storedRatio).toBe(250);

  await page.getByRole("button", { name: "1:1", exact: true }).click();
  await expect.poll(storedRatio).toBe(1);
});

test("saving draws measurements into the PDF, keeping them until the new version is stored", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const box = await openMeasureTool(page);
  const at = (fx: number, fy: number) =>
    [box.x + box.width * fx, box.y + box.height * fy] as const;

  await page.mouse.click(...at(0.2, 0.3));
  await page.mouse.click(...at(0.6, 0.3));
  await expect.poll(async () => (await storedLines(page)).length).toBe(1);

  await page.getByRole("button", { name: "Save to PDF" }).click();
  await expect(page.getByText("Saved 1 measurement to the PDF")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Nothing measured yet.")).toBeVisible();

  // The viewer reloads the new version; once it has, drawing carries on.
  await expect(async () => {
    await page.mouse.click(...at(0.4, 0.3));
    await expect(page.getByText("Click to place the end.")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
});
