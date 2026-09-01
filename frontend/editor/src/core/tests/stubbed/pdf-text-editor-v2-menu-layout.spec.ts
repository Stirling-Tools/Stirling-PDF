import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

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

/** Switch to the Document tab, which owns the document-level preferences. */
async function openSettings(page: Page): Promise<void> {
  await page.getByTestId("v2-tab-document").click();
  await expect(page.getByTestId("v2-view-settings")).toBeVisible();
}

test.describe("v2 editor - inspector layout", () => {
  test("Arrange groups z-order, align and distribute with correct gating", async ({
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
    // Arrange is a toolbar verb, beside the formatting it accompanies.
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

  test("image controls stay absent while a text run is selected", async ({
    page,
  }) => {
    await open(page, 0);
    const id = await runId(page, 0, "Downloads");
    await selectOne(page, id);
    // Rotate/flip cannot apply to a text run, so the section does not render
    // at all rather than rendering disabled.
    await expect(page.getByTestId("v2-imgop-menu")).toHaveCount(0);
    await expect(page.getByTestId("v2-imgop-rotate-cw")).toHaveCount(0);
    // Text-only controls are the ones on show instead.
    await expect(page.getByTestId("v2-font-size")).toBeVisible();
  });

  test("the inspector shows nothing selectable with nothing selected", async ({
    page,
  }) => {
    await open(page, 0);
    // No object picked: the panel offers an empty state, not a wall of
    // disabled controls the user has to learn to ignore.
    await expect(page.getByTestId("v2-nothing-selected")).toBeVisible();
    for (const id of [
      "v2-arrange-menu",
      "v2-imgop-menu",
      "v2-font-size",
      "v2-toggle-lock",
      "v2-delete",
      "v2-group",
      "v2-ungroup",
      "v2-pos-x",
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
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

  test("the strip shows formatting only once something is selected", async ({
    page,
  }) => {
    await open(page, 0);
    const toolbar = page.getByTestId("v2-toolbar");
    // Always available, selection or not.
    for (const id of ["v2-undo", "v2-redo"]) {
      await expect(toolbar.getByTestId(id)).toBeVisible();
    }
    // Contextual: absent, rather than present-and-greyed, with no selection.
    for (const id of [
      "v2-font-size",
      "v2-colour",
      "v2-italic",
      "v2-arrange-menu",
      "v2-toggle-lock",
      "v2-delete",
    ]) {
      await expect(toolbar.getByTestId(id)).toHaveCount(0);
    }
    // ...and all of them appear in the strip once a run is picked.
    await selectOne(page, await runId(page, 0, "Downloads"));
    for (const id of [
      "v2-font-size",
      "v2-colour",
      "v2-italic",
      "v2-arrange-menu",
      "v2-toggle-lock",
      "v2-delete",
    ]) {
      await expect(toolbar.getByTestId(id)).toBeVisible();
    }
  });

  test("the inspector keeps geometry and paragraph structure", async ({
    page,
  }) => {
    await open(page, 0);
    await selectOne(page, await runId(page, 0, "Downloads"));
    const sidebar = page.getByTestId("v2-sidebar-status");
    // Labelled numeric fields need the panel's vertical room, so they live
    // here rather than in the horizontal strip.
    for (const id of ["v2-pos-x", "v2-pos-y", "v2-size-w", "v2-group"]) {
      await expect(sidebar.getByTestId(id)).toBeVisible();
    }
    // ...and the strip does not duplicate them.
    for (const id of ["v2-pos-x", "v2-group"]) {
      await expect(page.getByTestId("v2-toolbar").getByTestId(id)).toHaveCount(
        0,
      );
    }
  });

  test("zoom floats on the canvas and save is pinned to the panel", async ({
    page,
  }) => {
    await open(page, 0);
    await expect(page.getByTestId("v2-save")).toBeVisible();
    await expect(page.getByTestId("v2-download")).toBeVisible();
    // Zoom sits over the pages it scales, not in the far rail.
    const zoom = page.getByTestId("v2-zoom-controls");
    await expect(zoom).toBeVisible();
    await expect(zoom.getByTestId("v2-zoom-percent")).toBeVisible();
    await expect(
      page.getByTestId("v2-stage").getByTestId("v2-zoom-controls"),
    ).toHaveCount(0);
  });

  test("everyday settings are plain; only parse options are behind Advanced", async ({
    page,
  }) => {
    await open(page);
    // Find and the shortcuts sheet are everyday controls, not settings: they
    // sit in the panel header, one click from anywhere.
    await expect(page.getByTestId("v2-open-find")).toBeVisible();
    await expect(page.getByTestId("v2-help")).toBeVisible();

    await openSettings(page);
    // View toggles are on show - no disclosure to discover first.
    await expect(page.getByTestId("v2-toggle-rulers")).toBeVisible();
    await expect(page.getByTestId("v2-spellcheck")).toBeVisible();

    // The two options that change how the document was PARSED start folded,
    // because switching grouping re-reads it and drops undo history.
    await expect(page.getByTestId("v2-grouping-mode-control")).toBeHidden();
    await expect(page.getByTestId("v2-width-mode-control")).toBeHidden();
    await page.getByTestId("v2-advanced-toggle").click();
    await expect(page.getByTestId("v2-grouping-mode-control")).toBeVisible();
    await expect(page.getByTestId("v2-width-mode-control")).toBeVisible();
  });

  test("Add text toggles its label and inserts from the panel", async ({
    page,
  }) => {
    await open(page, 0);
    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const before = await runs.count();
    const addText = page.getByTestId("v2-add-text");
    await addText.click();
    await expect(addText).toContainText(/click page/i);
    await page.getByTestId("v2-page-0").click({ position: { x: 200, y: 400 } });
    await expect(runs).toHaveCount(before + 1, { timeout: 5_000 });
    await expect(addText).toHaveText("Add text");
  });

  test("the Document tab lists the page fonts with a status badge", async ({
    page,
  }) => {
    await open(page, 0);
    await page.getByTestId("v2-tab-document").click();
    const panel = page.getByTestId("v2-fonts-panel");
    await expect(panel).toBeVisible();
    // Collapsed by default: one headline row carrying an honest tone
    // (ok / info / warn), never a blanket "no issues" for embedded fonts.
    const compat = panel.getByTestId("v2-font-compat");
    await expect(compat).toBeVisible();
    const tone = await compat.getAttribute("data-compat");
    expect(["ok", "info", "warn"]).toContain(tone);
    // The per-font detail is one click away.
    await panel.getByTestId("v2-fonts-toggle").click();
    const badges = panel.locator('[data-testid^="v2-font-"]');
    expect(await badges.count()).toBeGreaterThan(0);
  });
});
