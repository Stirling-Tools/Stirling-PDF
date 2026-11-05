import path from "node:path";

import { test, expect } from "@editor/tests/helpers/stub-test-base";
import {
  uploadFiles,
  dismissTourTooltip,
} from "@editor/tests/helpers/ui-helpers";

/**
 * Extended coverage for the Page Editor's duplicate affordances (issue #5443):
 * the per-tile hover action, the toolbar action for a multi-selection, the
 * Ctrl+D shortcut, track isolation, and that a save persists duplicates.
 */

const ROTATED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/rotated-pages.pdf",
);
const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

test.use({ autoGoto: false, viewport: { width: 1600, height: 900 } });

function track(page: import("@playwright/test").Page, name: string) {
  return page.locator(`section[aria-label="${name}"]`);
}

function tile(
  page: import("@playwright/test").Page,
  name: string,
  index: number,
) {
  return track(page, name).locator("[data-page-id]").nth(index);
}

async function switchView(
  page: import("@playwright/test").Page,
  label: string,
) {
  await page
    .locator('[data-tour="view-switcher"]')
    .first()
    .locator(".mantine-SegmentedControl-label", { hasText: label })
    .click();
}

/** Intrinsic rotations as the editor shows them, in track order. */
async function readRotations(
  lane: import("@playwright/test").Locator,
  expectedCount: number,
) {
  const imgs = lane.locator("[data-page-id] img[data-original-rotation]");
  await expect(imgs).toHaveCount(expectedCount, { timeout: 60_000 });
  return imgs.evaluateAll((nodes) =>
    nodes.map((node) => Number(node.getAttribute("data-original-rotation"))),
  );
}

async function openPageEditor(page: import("@playwright/test").Page) {
  await page.goto("/editor", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await uploadFiles(page, [ROTATED_PDF, SAMPLE_PDF]);
  await dismissTourTooltip(page);
  await switchView(page, "Page Editor");
  await expect(page.getByTestId("page-tracks")).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    track(page, "rotated-pages.pdf").locator("[data-page-id]"),
  ).toHaveCount(4, { timeout: 30_000 });
}

test.describe("Page editor duplicate", () => {
  test("the tile hover action duplicates one page right after itself", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    const sample = track(page, "sample.pdf");
    // Rotations: 0, 90, 270, 180 — position proof for the insert.
    expect(await readRotations(rotated, 4)).toEqual([0, 90, 270, 180]);

    const third = tile(page, "rotated-pages.pdf", 2);
    await third.hover();
    await third.getByRole("button", { name: "Duplicate page" }).click();

    await expect(rotated.locator("[data-page-id]")).toHaveCount(5);
    // The copy lands after page 3 and carries its rotation; page 4 follows.
    expect(await readRotations(rotated, 5)).toEqual([0, 90, 270, 270, 180]);
    await expect(rotated).toContainText("edited");
    // The other track is untouched.
    await expect(sample.locator("[data-page-id]")).toHaveCount(1);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(4);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(5);
  });

  test("the toolbar action duplicates a multi-selection and Ctrl+D the selection", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");

    await tile(page, "rotated-pages.pdf", 0).click();
    await tile(page, "rotated-pages.pdf", 1).click({ modifiers: ["Shift"] });
    await page
      .getByRole("button", { name: "Duplicate selected pages" })
      .click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(6);
    // The selected block is copied after its last page: [0,90,0,90,270,180].
    expect(await readRotations(rotated, 6)).toEqual([0, 90, 0, 90, 270, 180]);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(4);

    await tile(page, "rotated-pages.pdf", 1).click();
    await page.keyboard.press("Control+d");
    await expect(rotated.locator("[data-page-id]")).toHaveCount(5);
  });

  test("a save persists a duplicated page", async ({ page }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");

    const first = tile(page, "rotated-pages.pdf", 0);
    await first.hover();
    await first.getByRole("button", { name: "Duplicate page" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(5);

    await page
      .getByRole("button", { name: "Save changes to all files" })
      .click();

    const saved = track(page, "rotated-pages.pdf");
    await expect(saved).toContainText("v2", { timeout: 90_000 });
    await expect(saved).not.toContainText("edited");
    await expect(saved.locator("[data-page-id]")).toHaveCount(5);
    // The duplicate of page 1 keeps its content on the way through the save.
    expect(await readRotations(saved, 5)).toEqual([0, 0, 90, 270, 180]);
  });

  test("duplicating a blank page keeps it blank", async ({ page }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");

    await tile(page, "rotated-pages.pdf", 0).click();
    await page
      .getByRole("button", { name: "Insert blank pages after selected pages" })
      .click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(5);

    const blank = tile(page, "rotated-pages.pdf", 1);
    await blank.hover();
    await blank.getByRole("button", { name: "Duplicate page" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(6);
    await expect(blank.locator("canvas, svg, img").first()).toBeVisible();
  });
});
