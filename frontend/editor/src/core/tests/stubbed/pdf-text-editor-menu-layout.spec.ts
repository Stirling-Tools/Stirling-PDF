import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { EditorTestWindow } from "@app/tests/stubbed/editorTestTypes";

/**
 * Layout coverage for the properties-inspector panel.
 *
 * The contract these tests pin down: the canvas strip carries only verbs that
 * are always available, everything selection-scoped lives in the right-hand
 * inspector, and set-and-forget preferences live behind the overflow menu.
 */
const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

async function open(page: Page, firstPage = 0): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SAMPLE);
  await expect(page.getByTestId(`pdf-editor-page-${firstPage}`)).toBeVisible({
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
      const r = (window as unknown as EditorTestWindow).__editor_store.doc
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
      (
        window as unknown as EditorTestWindow
      ).__editor_store.selection.selectOne(rid),
    id,
  );
  await page.waitForTimeout(150);
}

/** Switch to the Document tab, which owns the document-level preferences. */
async function openSettings(page: Page): Promise<void> {
  await page.getByTestId("pdf-editor-tab-document").click();
  await expect(page.getByTestId("pdf-editor-view-settings")).toBeVisible();
}

test.describe("PDF text editor - inspector layout", () => {
  test("Arrange groups z-order, align and distribute with correct gating", async ({
    page,
  }) => {
    await open(page, 0);
    // A single single-line run: z-order is always available, align needs
    // 2+ objects and distribute needs 3+, so both are gated off here.
    const id = await runId(page, 0, "Downloads");
    await selectOne(page, id);

    const arrange = page.getByTestId("pdf-editor-arrange-menu");
    await expect(arrange).toBeVisible();
    await expect(arrange).toBeEnabled();
    // Arrange is a toolbar verb, beside the formatting it accompanies.
    await expect(
      page
        .getByTestId("pdf-editor-toolbar")
        .getByTestId("pdf-editor-arrange-menu"),
    ).toHaveCount(1);

    await arrange.click();
    // Sub-section labels make the grouping explicit.
    await expect(page.getByText("Align · needs 2+ objects")).toBeVisible();
    await expect(page.getByText("Distribute · needs 3+ objects")).toBeVisible();
    // Z-order works on a single object; align/distribute are disabled.
    await expect(page.getByTestId("pdf-editor-z-to-front")).toBeEnabled();
    await expect(page.getByTestId("pdf-editor-align-left")).toBeDisabled();
    await expect(page.getByTestId("pdf-editor-distribute-h")).toBeDisabled();
    await page.keyboard.press("Escape");
  });

  test("image controls stay absent while a text run is selected", async ({
    page,
  }) => {
    await open(page, 0);
    const id = await runId(page, 0, "Downloads");
    await selectOne(page, id);
    // Rotate/flip cannot apply to a text run, so the section does not render
    // at all rather than rendering disabled.
    await expect(page.getByTestId("pdf-editor-imgop-menu")).toHaveCount(0);
    await expect(page.getByTestId("pdf-editor-imgop-rotate-cw")).toHaveCount(0);
    // Text-only controls are the ones on show instead.
    await expect(page.getByTestId("pdf-editor-font-size")).toBeVisible();
  });

  test("the inspector shows nothing selectable with nothing selected", async ({
    page,
  }) => {
    await open(page, 0);
    // No object picked: the panel offers an empty state, not a wall of
    // disabled controls the user has to learn to ignore.
    await expect(page.getByTestId("pdf-editor-nothing-selected")).toBeVisible();
    for (const id of [
      "pdf-editor-arrange-menu",
      "pdf-editor-imgop-menu",
      "pdf-editor-font-size",
      "pdf-editor-toggle-lock",
      "pdf-editor-delete",
      "pdf-editor-group",
      "pdf-editor-ungroup",
      "pdf-editor-pos-x",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("lock and delete are icon buttons in the toolbar", async ({ page }) => {
    await open(page, 0);
    const id = await runId(page, 0, "Downloads");
    await selectOne(page, id);
    const toolbar = page.getByTestId("pdf-editor-toolbar");
    // Icon-only: identified by aria-label, located inside the toolbar.
    await expect(toolbar.getByTestId("pdf-editor-toggle-lock")).toBeVisible();
    await expect(toolbar.getByTestId("pdf-editor-delete")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-toggle-lock")).toHaveAttribute(
      "aria-label",
      /lock selection/i,
    );
  });

  test("the strip shows formatting only once something is selected", async ({
    page,
  }) => {
    await open(page, 0);
    const toolbar = page.getByTestId("pdf-editor-toolbar");
    // Always available, selection or not.
    for (const id of ["pdf-editor-undo", "pdf-editor-redo"]) {
      await expect(toolbar.getByTestId(id)).toBeVisible();
    }
    // Contextual: absent, rather than present-and-greyed, with no selection.
    for (const id of [
      "pdf-editor-font-size",
      "pdf-editor-colour",
      "pdf-editor-italic",
      "pdf-editor-arrange-menu",
      "pdf-editor-toggle-lock",
      "pdf-editor-delete",
    ]) {
      await expect(toolbar.getByTestId(id)).toHaveCount(0);
    }
    // ...and all of them appear in the strip once a run is picked.
    await selectOne(page, await runId(page, 0, "Downloads"));
    for (const id of [
      "pdf-editor-font-size",
      "pdf-editor-colour",
      "pdf-editor-italic",
      "pdf-editor-arrange-menu",
      "pdf-editor-toggle-lock",
      "pdf-editor-delete",
    ]) {
      await expect(toolbar.getByTestId(id)).toBeVisible();
    }
  });

  test("the inspector keeps geometry and paragraph structure", async ({
    page,
  }) => {
    await open(page, 0);
    await selectOne(page, await runId(page, 0, "Downloads"));
    const sidebar = page.getByTestId("pdf-editor-sidebar-status");
    // Labelled numeric fields need the panel's vertical room, so they live
    // here rather than in the horizontal strip.
    for (const id of [
      "pdf-editor-pos-x",
      "pdf-editor-pos-y",
      "pdf-editor-size-w",
      "pdf-editor-group",
    ]) {
      await expect(sidebar.getByTestId(id)).toBeVisible();
    }
    // ...and the strip does not duplicate them.
    for (const id of ["pdf-editor-pos-x", "pdf-editor-group"]) {
      await expect(
        page.getByTestId("pdf-editor-toolbar").getByTestId(id),
      ).toHaveCount(0);
    }
  });

  test("zoom floats on the canvas and save is pinned to the panel", async ({
    page,
  }) => {
    await open(page, 0);
    await expect(page.getByTestId("pdf-editor-save")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-download")).toBeVisible();
    // Zoom sits over the pages it scales, not in the far rail.
    const zoom = page.getByTestId("pdf-editor-zoom-controls");
    await expect(zoom).toBeVisible();
    await expect(zoom.getByTestId("pdf-editor-zoom-percent")).toBeVisible();
    await expect(
      page
        .getByTestId("pdf-editor-stage")
        .getByTestId("pdf-editor-zoom-controls"),
    ).toHaveCount(0);
  });

  test("everyday settings are plain; only parse options are behind Advanced", async ({
    page,
  }) => {
    await open(page);
    // Find and the shortcuts sheet are everyday controls, not settings: they
    // sit in the panel header, one click from anywhere.
    await expect(page.getByTestId("pdf-editor-open-find")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-help")).toBeVisible();

    await openSettings(page);
    // View toggles are on show - no disclosure to discover first.
    await expect(page.getByTestId("pdf-editor-toggle-rulers")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-spellcheck")).toBeVisible();

    // The two options that change how the document was PARSED start folded,
    // because switching grouping re-reads it and drops undo history.
    await expect(
      page.getByTestId("pdf-editor-grouping-mode-control"),
    ).toBeHidden();
    await expect(
      page.getByTestId("pdf-editor-width-mode-control"),
    ).toBeHidden();
    await page.getByTestId("pdf-editor-advanced-toggle").click();
    await expect(
      page.getByTestId("pdf-editor-grouping-mode-control"),
    ).toBeVisible();
    await expect(
      page.getByTestId("pdf-editor-width-mode-control"),
    ).toBeVisible();
  });

  test("Add text toggles its label and inserts from the panel", async ({
    page,
  }) => {
    await open(page, 0);
    const runs = page.locator('[data-testid^="pdf-editor-run-p0-"]');
    const before = await runs.count();
    const addText = page.getByTestId("pdf-editor-add-text");
    await addText.click();
    await expect(addText).toContainText(/click page/i);
    await page
      .getByTestId("pdf-editor-page-0")
      .click({ position: { x: 200, y: 400 } });
    await expect(runs).toHaveCount(before + 1, { timeout: 5_000 });
    await expect(addText).toHaveText("Add text");
  });

  test("the Document tab lists the page fonts with a status badge", async ({
    page,
  }) => {
    await open(page, 0);
    await page.getByTestId("pdf-editor-tab-document").click();
    const panel = page.getByTestId("pdf-editor-fonts-panel");
    await expect(panel).toBeVisible();
    // Collapsed by default: one headline row carrying an honest tone
    // (ok / info / warn), never a blanket "no issues" for embedded fonts.
    const compat = panel.getByTestId("pdf-editor-font-compat");
    await expect(compat).toBeVisible();
    const tone = await compat.getAttribute("data-compat");
    expect(["ok", "info", "warn"]).toContain(tone);
    // The per-font detail is one click away.
    await panel.getByTestId("pdf-editor-fonts-toggle").click();
    const badges = panel.locator('[data-testid^="pdf-editor-font-"]');
    expect(await badges.count()).toBeGreaterThan(0);
  });
});
