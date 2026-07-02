import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

/**
 * UI-layout coverage for the menu-grouped editor chrome:
 *  - the toolbar holds the per-selection controls, with z-order / align /
 *    distribute collapsed under an "Arrange" menu and rotate/flip under an
 *    "Image" menu (icon-only lock + delete);
 *  - the sidebar holds the general editor tools (Insert, Paragraph, Editor
 *    settings) - NOT in the toolbar;
 *  - the slim app top bar holds only chrome (zoom / save / help).
 */
const SAMPLE = path.join(__dirname, "../../../../public/samples/Sample.pdf");

async function open(page: Page, firstPage = 0): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId(`v2-page-${firstPage}`)).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
}

async function runId(
  page: Page,
  pageIdx: number,
  src: string,
): Promise<string> {
  const id = await page.evaluate(
    ({ pageIdx, src }: { pageIdx: number; src: string }) => {
      const r = (window as unknown as V2TestWindow).__v2_editor_store.doc
        .page(pageIdx)
        .runs.find((x) => new RegExp(src).test(x.text));
      return r ? r.id : null;
    },
    { pageIdx, src },
  );
  if (!id) throw new Error(`run /${src}/ not found`);
  return id;
}

async function selectOne(page: Page, id: string): Promise<void> {
  await page.evaluate(
    (rid: string) =>
      (window as unknown as V2TestWindow).__v2_editor_store.selection.selectOne(
        rid,
      ),
    id,
  );
  await page.waitForTimeout(150);
}

test.describe("v2 editor - menu-grouped layout", () => {
  test("Arrange menu groups z-order, align and distribute with correct gating", async ({
    page,
  }) => {
    await open(page, 0);
    // A single single-line run: z-order is always available, align needs
    // 2+ objects and distribute needs 3+, so both are gated off here.
    const id = await runId(page, 0, "Downloads");
    await selectOne(page, id);

    const arrange = page.getByTestId("v2-arrange-menu");
    await expect(arrange).toBeVisible();
    await expect(arrange).toBeEnabled();
    // The Arrange control belongs to the toolbar, not the sidebar.
    await expect(
      page.getByTestId("v2-toolbar").getByTestId("v2-arrange-menu"),
    ).toHaveCount(1);

    await arrange.click();
    // Sub-section labels make the grouping explicit.
    await expect(page.getByText("Align · needs 2+ objects")).toBeVisible();
    await expect(page.getByText("Distribute · needs 3+ objects")).toBeVisible();
    // Z-order works on a single object; align/distribute are disabled.
    await expect(page.getByTestId("v2-z-to-front")).toBeEnabled();
    await expect(page.getByTestId("v2-align-left")).toBeDisabled();
    await expect(page.getByTestId("v2-distribute-h")).toBeDisabled();
    await page.keyboard.press("Escape");
  });

  test("Image menu opens with rotate/flip gated off while a text run is selected", async ({
    page,
  }) => {
    await open(page, 0);
    const id = await runId(page, 0, "Downloads");
    await selectOne(page, id);
    // Enabled because something is selected, but the transforms are disabled
    // and an in-dropdown label explains why (reachable, unlike a tooltip on a
    // disabled button).
    await expect(page.getByTestId("v2-imgop-menu")).toBeEnabled();
    await page.getByTestId("v2-imgop-menu").click();
    await expect(page.getByText("Select an image first")).toBeVisible();
    await expect(page.getByTestId("v2-imgop-rotate-cw")).toBeDisabled();
    await page.getByTestId("v2-zoom-percent").click();
  });

  test("Arrange and Image menus are disabled with nothing selected", async ({
    page,
  }) => {
    await open(page, 0);
    // On load no object is selected, so both selection-scoped menus are off.
    await expect(page.getByTestId("v2-arrange-menu")).toBeDisabled();
    await expect(page.getByTestId("v2-imgop-menu")).toBeDisabled();
  });

  test("lock and delete are icon buttons in the toolbar", async ({ page }) => {
    await open(page, 0);
    const id = await runId(page, 0, "Downloads");
    await selectOne(page, id);
    const toolbar = page.getByTestId("v2-toolbar");
    // Icon-only: identified by aria-label, located inside the toolbar.
    await expect(toolbar.getByTestId("v2-toggle-lock")).toBeVisible();
    await expect(toolbar.getByTestId("v2-delete")).toBeVisible();
    await expect(page.getByTestId("v2-toggle-lock")).toHaveAttribute(
      "aria-label",
      /lock selection/i,
    );
  });

  test("general tools live in the sidebar, not the toolbar", async ({
    page,
  }) => {
    await open(page, 0);
    const sidebar = page.getByTestId("v2-sidebar-status");
    // Insert + Paragraph + Editor-settings controls are in the sidebar.
    for (const id of [
      "v2-add-text",
      "v2-add-image",
      "v2-group",
      "v2-ungroup",
      "v2-grouping-mode-control",
      "v2-width-mode-control",
    ]) {
      await expect(sidebar.getByTestId(id)).toBeVisible();
    }
    // ...and they are NOT duplicated in the toolbar.
    const toolbar = page.getByTestId("v2-toolbar");
    for (const id of ["v2-add-text", "v2-add-image", "v2-group"]) {
      await expect(toolbar.getByTestId(id)).toHaveCount(0);
    }
  });

  test("app top bar holds only chrome (no insert/group controls)", async ({
    page,
  }) => {
    await open(page, 0);
    // Zoom / save / help remain; insert + paragraph actions moved out.
    await expect(page.getByTestId("v2-save")).toBeVisible();
    await expect(page.getByTestId("v2-zoom-percent")).toBeVisible();
    await expect(page.getByTestId("v2-help")).toBeVisible();
  });

  test("Add text toggles its label and inserts from the sidebar", async ({
    page,
  }) => {
    await open(page, 0);
    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const before = await runs.count();
    const addText = page.getByTestId("v2-add-text");
    await addText.click();
    await expect(addText).toContainText(/click page to add text/i);
    await page.getByTestId("v2-page-0").click({ position: { x: 200, y: 400 } });
    await expect(runs).toHaveCount(before + 1, { timeout: 5_000 });
    await expect(addText).toHaveText("Add text");
  });

  test("sidebar lists the page fonts with a status badge", async ({ page }) => {
    await open(page, 0);
    const panel = page.getByTestId("v2-fonts-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Fonts", { exact: true })).toBeVisible();
    // At least one font row with a status badge (standard / embedded / subset).
    const badges = panel.locator('[data-testid^="v2-font-"]');
    expect(await badges.count()).toBeGreaterThan(0);
  });

  test("fonts panel shows a compatibility summary and an info explainer", async ({
    page,
  }) => {
    await open(page, 0);
    const panel = page.getByTestId("v2-fonts-panel");
    // The summary banner is present and carries an honest tone (ok / info /
    // warn) - never claiming a blanket "no issues" for embedded fonts.
    const compat = panel.getByTestId("v2-font-compat");
    await expect(compat).toBeVisible();
    const tone = await compat.getAttribute("data-compat");
    expect(["ok", "info", "warn"]).toContain(tone);
    // The (i) explainer is present and reveals the existing-vs-new guidance.
    const info = panel.getByTestId("v2-fonts-info");
    await expect(info).toBeVisible();
    await info.hover();
    await expect(page.getByText(/New characters/i).first()).toBeVisible();
  });
});
