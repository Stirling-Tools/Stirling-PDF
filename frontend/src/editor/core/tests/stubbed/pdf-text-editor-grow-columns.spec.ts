import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Grow widens a box up to the page edge. On a page of two columns the text
// beside a left-column line is an edge too: typing past the end of that line
// wraps it inside its column instead of drawing over the column on its right.

const TWO_COLUMN_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/two-column-sample.pdf",
);
const GUTTER_LEFT = 296.5;
const TYPED = " with extra cargo";

interface RunState {
  id: string;
  text: string;
  bounds: { x: number; y: number; width: number; height: number };
}

interface EditorWindow {
  __editor_store: {
    document: unknown;
    state: { pages: { runs: RunState[] }[] };
  };
  __prev_document?: unknown;
}

const pageRuns = (page: Page): Promise<RunState[]> =>
  page.evaluate(() =>
    (window as unknown as EditorWindow).__editor_store.state.pages[0].runs.map(
      ({ id, text, bounds }) => ({ id, text, bounds: { ...bounds } }),
    ),
  );

const rightColumn = (runs: RunState[]) =>
  runs
    .filter((run) => run.bounds.x > GUTTER_LEFT)
    .map(({ text, bounds }) => ({
      text,
      x: Math.round(bounds.x * 10) / 10,
      y: Math.round(bounds.y * 10) / 10,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

const acrossGutter = (runs: RunState[]) =>
  runs
    .filter(
      (run) =>
        !run.text.includes("regional council") &&
        run.bounds.x < GUTTER_LEFT &&
        run.bounds.x + run.bounds.width > GUTTER_LEFT,
    )
    .map((run) => run.text);

async function open(page: Page, file: string): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as Partial<EditorWindow>;
    w.__prev_document = w.__editor_store?.document;
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(file);
  await page.waitForFunction(
    () => {
      const w = window as unknown as Partial<EditorWindow>;
      return (
        !!w.__editor_store?.document &&
        w.__editor_store.document !== w.__prev_document &&
        (w.__editor_store.state.pages[0]?.runs.length ?? 0) > 0
      );
    },
    null,
    { timeout: 60_000 },
  );
}

test("typing past a left-column line in Grow wraps it inside its column", async ({
  page,
}, testInfo) => {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await open(page, TWO_COLUMN_PDF);

  const before = await pageRuns(page);
  const target = before.find((run) => run.text.startsWith("Northern ferries"));
  expect(target, "left column paragraph").toBeTruthy();
  const neighbour = before.find((run) => run.text.startsWith("Village"));
  expect(neighbour, "right column paragraph").toBeTruthy();
  const linesBefore = target!.text.split("\n").length;

  const box = page.getByTestId(`pdf-editor-run-${target!.id}`);
  const beside = page.getByTestId(`pdf-editor-run-${neighbour!.id}`);
  await box.click();
  await expect(box).toBeFocused();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("End");
  await page.keyboard.type(TYPED, { delay: 40 });

  const textNow = () =>
    page.evaluate(
      (id) =>
        (
          window as unknown as EditorWindow
        ).__editor_store.state.pages[0].runs.find((run) => run.id === id)
          ?.text ?? "",
      target!.id,
    );
  await expect
    .poll(async () => (await textNow()).replace(/\s+/g, " "), {
      timeout: 30_000,
    })
    .toContain("the islands with extra cargo");
  expect((await textNow()).split("\n").length).toBeGreaterThan(linesBefore);

  const boxRight = (await box.boundingBox())!;
  const besideLeft = (await beside.boundingBox())!;
  expect(boxRight.x + boxRight.width).toBeLessThanOrEqual(besideLeft.x);

  const during = await pageRuns(page);
  expect(acrossGutter(during)).toEqual([]);
  expect(rightColumn(during)).toEqual(rightColumn(before));

  await box.evaluate((el) => el.blur());
  const downloaded = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("pdf-editor-download").click();
  const confirm = page.getByTestId("pdf-editor-save-risk-confirm");
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  const saved = testInfo.outputPath("grow-columns.pdf");
  await (await downloaded).saveAs(saved);

  await open(page, saved);
  const reopened = await pageRuns(page);
  expect(rightColumn(reopened)).toEqual(rightColumn(before));
  expect(
    reopened.find((run) => run.text.startsWith("Northern ferries"))?.text,
  ).toMatch(/with\s+extra\s+cargo/);
  expect(acrossGutter(reopened)).toEqual([]);
});
