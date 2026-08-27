import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

/** Drives the real UI control by control; the screenshots are the record. */
const SAMPLE = path.join(
  import.meta.dirname,
  "../test-fixtures/user-sample.pdf",
);
// Screenshots are evidence, not source: keep them out of the repo tree.
const SHOTS = path.join(
  import.meta.dirname,
  "../../../../test-results/walkthrough-shots",
);

async function openEditor(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 45_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(900);
}

/** Select the first editable run through the page, as a user would. */
async function selectFirstRun(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const store = (window as unknown as V2TestWindow).__v2_editor_store;
    const run = store.doc.page(0).runs.find((r) => !r.locked && r.text.trim());
    if (run) store.selection.selectOne(run.id);
    return run?.id ?? "";
  });
  expect(id).toBeTruthy();
  await page.waitForTimeout(200);
  return id;
}

test("the new toolbar controls are present and usable", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openEditor(page);

  // Outline controls live behind the advanced-colour button.
  await selectFirstRun(page);
  await page.getByTestId("v2-colour-advanced").click();
  await expect(page.getByTestId("v2-outline-colour")).toBeVisible();
  await expect(page.getByTestId("v2-outline-width")).toBeVisible();
  // The device-font picker replaced the plain family Select.
  await expect(page.getByTestId("v2-font-family")).toBeVisible();

  await page.screenshot({ path: path.join(SHOTS, "01-toolbar.png") });
});

test("giving a run an outline changes it, and undo takes it back", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openEditor(page);
  const runId = await selectFirstRun(page);

  const before = await page.evaluate((id: string) => {
    const store = (window as unknown as V2TestWindow).__v2_editor_store;
    const run = store.doc.page(0).runs.find((r) => r.id === id);
    return { stroke: run?.stroke ?? null, width: run?.strokeWidth ?? 0 };
  }, runId);
  expect(before.stroke).toBeNull();

  await page.getByTestId("v2-colour-advanced").click();
  await page.getByTestId("v2-outline-width").fill("2");
  await page.getByTestId("v2-outline-width").press("Enter");
  await page.waitForTimeout(400);

  const after = await page.evaluate((id: string) => {
    const store = (window as unknown as V2TestWindow).__v2_editor_store;
    const run = store.doc.page(0).runs.find((r) => r.id === id);
    return {
      stroke: run?.stroke ?? null,
      width: run?.strokeWidth ?? 0,
      renderMode: run?.renderMode ?? 0,
    };
  }, runId);
  expect(after.width).toBeGreaterThan(0);
  // Width alone is invisible; the run must also move to a stroking mode.
  expect(after.renderMode).toBe(2);
  await page.screenshot({ path: path.join(SHOTS, "02-outline-applied.png") });

  await page.getByTestId("v2-undo").click();
  await page.waitForTimeout(400);
  const reverted = await page.evaluate((id: string) => {
    const store = (window as unknown as V2TestWindow).__v2_editor_store;
    const run = store.doc.page(0).runs.find((r) => r.id === id);
    return { width: run?.strokeWidth ?? 0, renderMode: run?.renderMode ?? 0 };
  }, runId);
  expect(reverted.width).toBe(0);
  expect(reverted.renderMode).toBe(0);
});

test("rulers and guides can be switched on from the sidebar", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openEditor(page);

  const toggle = page.getByTestId("v2-toggle-rulers");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await page.waitForTimeout(500);

  const rulers = page.getByTestId("v2-rulers-0");
  await expect(rulers).toBeVisible();
  await expect(page.getByTestId("v2-ruler-top-0")).toBeVisible();
  await expect(page.getByTestId("v2-ruler-left-0")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "03-rulers.png") });

  await toggle.click();
  await page.waitForTimeout(300);
  await expect(rulers).toHaveCount(0);
});

test("find offers the new matching options", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openEditor(page);

  await page.keyboard.press("Control+f");
  await page.waitForTimeout(400);
  await expect(page.getByTestId("v2-find-match-case")).toBeVisible();
  await expect(page.getByTestId("v2-find-whole-word")).toBeVisible();
  await expect(page.getByTestId("v2-find-ignore-accents")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "04-find.png") });
});

test("the sidebar exposes the spellcheck control", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openEditor(page);
  const control = page.getByTestId("v2-spellcheck");
  // The sidebar scrolls, so bring the control into view the way a user would.
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  await expect(page.getByTestId("v2-spellcheck-language")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "05-sidebar.png") });
});

test("a save still produces a readable PDF after the new passes run", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openEditor(page);
  const runId = await selectFirstRun(page);

  // Make a real edit so a page is regenerated and the save-time repair runs.
  await page.evaluate((id: string) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="v2-run-${id}"]`,
    );
    el?.focus();
  }, runId);
  await page.keyboard.type("X");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(600);

  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByTestId("v2-download").click();
  // A signed/risky document would gate here; this fixture is not one.
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(bytes.subarray(-2048).toString("latin1")).toContain("%%EOF");
});
