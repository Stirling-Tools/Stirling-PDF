import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";

import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles, dismissTourTooltip } from "@app/tests/helpers/ui-helpers";

// 4 portrait pages whose intrinsic /Rotate is 0, 90, 270, 180.
const ROTATED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/rotated-pages.pdf",
);
const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

test.use({ autoGoto: false });

/** The lane of one track, addressed by the file it saves back to. */
function track(page: import("@playwright/test").Page, name: string) {
  return page.locator(`section[aria-label="${name}"]`);
}

/**
 * Switches workbench view. The switcher is a Mantine SegmentedControl whose
 * radio input is visually hidden, so the click goes through the label.
 */
async function switchView(
  page: import("@playwright/test").Page,
  label: string,
) {
  await page
    .locator('[data-tour="view-switcher"]')
    .first()
    .getByText(label, { exact: true })
    .click();
}

/**
 * Rotations as the editor is displaying them. Thumbnails load lazily, so this
 * waits for the images before reading: an empty list means "not loaded yet",
 * not "no rotation".
 */
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

/**
 * Presses on one tile and drags to a fraction across another, without
 * releasing. dnd-kit's PointerSensor needs a real pointer sequence past its
 * activation distance, and the intermediate moves let it measure the target.
 */
async function dragPageOver(
  page: import("@playwright/test").Page,
  from: import("@playwright/test").Locator,
  to: import("@playwright/test").Locator,
  fractionAcross = 0.25,
) {
  const source = await from.boundingBox();
  const target = await to.boundingBox();
  if (!source || !target) throw new Error("drag endpoints are not laid out");

  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  const dropX = target.x + target.width * fractionAcross;
  const dropY = target.y + target.height / 2;
  for (const step of [0.2, 0.5, 0.8, 1]) {
    await page.mouse.move(
      source.x + (dropX - source.x) * step,
      source.y + (dropY - source.y) * step,
      { steps: 8 },
    );
  }
}

/**
 * The file the viewer is showing, per the sidebar's "viewed" row marker. Note
 * `.selected` is workbench selection, which is a different thing.
 */
function viewerActiveFile(page: import("@playwright/test").Page) {
  return page.locator(".file-sidebar-file-item.viewed .file-sidebar-file-name");
}

/** The tile the insertion line is currently drawn against. */
function dropTarget(page: import("@playwright/test").Page) {
  return page.locator("[data-page-id][data-drop-before]");
}

async function dragPageOnto(
  page: import("@playwright/test").Page,
  from: import("@playwright/test").Locator,
  to: import("@playwright/test").Locator,
  fractionAcross = 0.25,
) {
  await dragPageOver(page, from, to, fractionAcross);
  await page.mouse.up();
}

/** The order of the tracks, top to bottom. */
async function trackOrder(page: import("@playwright/test").Page) {
  return page
    .locator("section[aria-label] header")
    .evaluateAll((headers) =>
      headers.map(
        (h) =>
          (h.closest("section") as HTMLElement).getAttribute("aria-label") ??
          "",
      ),
    );
}

/** Drags a track's header onto another track, vertically. */
async function dragTrackOnto(
  page: import("@playwright/test").Page,
  sourceName: string,
  targetName: string,
  fractionDown = 0.25,
) {
  const from = await page
    .locator(`section[aria-label="${sourceName}"] header`)
    .boundingBox();
  const target = await page
    .locator(`section[aria-label="${targetName}"]`)
    .boundingBox();
  if (!from || !target) throw new Error("tracks are not laid out");

  await page.mouse.move(from.x + 140, from.y + from.height / 2);
  await page.mouse.down();
  const toX = target.x + 140;
  const toY = target.y + target.height * fractionDown;
  for (const step of [0.3, 0.7, 1]) {
    await page.mouse.move(
      from.x + 140 + (toX - (from.x + 140)) * step,
      from.y + from.height / 2 + (toY - (from.y + from.height / 2)) * step,
      { steps: 8 },
    );
  }
  await page.mouse.up();
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
}

test.describe("Page Editor tracks", () => {
  test("expands every open PDF into its own track of pages", async ({
    page,
  }) => {
    await openPageEditor(page);

    const rotated = track(page, "rotated-pages.pdf");
    const sample = track(page, "sample.pdf");
    await expect(rotated).toBeVisible({ timeout: 30_000 });
    await expect(sample).toBeVisible();

    // Each track holds only its own file's pages.
    await expect(rotated.locator("[data-page-id]")).toHaveCount(4, {
      timeout: 30_000,
    });
    await expect(sample.locator("[data-page-id]")).toHaveCount(1);

    // Pages start at their true source rotation, not upright.
    expect(await readRotations(rotated, 4)).toEqual([0, 90, 270, 180]);
  });

  test("rotating and deleting are held in memory until save, then versioned", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    await expect(rotated.locator("[data-page-id]")).toHaveCount(4, {
      timeout: 30_000,
    });

    // Rotate page 3 right: 270 + 90 lands on 0, the case a save must not drop.
    const third = rotated.locator("[data-page-id]").nth(2);
    await third.hover();
    await third.getByRole("button", { name: "Rotate right" }).click();
    await expect(third.locator("img[data-original-rotation]")).toHaveAttribute(
      "data-original-rotation",
      "0",
    );

    // Delete the last page. Nothing is written yet, so the track just shrinks.
    const fourth = rotated.locator("[data-page-id]").nth(3);
    await fourth.hover();
    await fourth.getByRole("button", { name: "Delete page" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(3);
    await expect(rotated).toContainText("edited");

    // Undo restores it; redo takes it away again.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(4);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(3);

    await page
      .getByRole("button", { name: "Save changes to all files" })
      .click();

    // The save landed as version 2 of the same file, with nothing pending.
    const saved = track(page, "rotated-pages.pdf");
    await expect(saved).toContainText("v2", { timeout: 90_000 });
    await expect(saved).not.toContainText("edited");
    await expect(saved.locator("[data-page-id]")).toHaveCount(3);

    // The rebuilt track reads its rotations back out of the saved PDF, so this
    // proves the bytes carry the absolute rotation the editor was showing,
    // including page 3's 270 + 90 = 0, which a relative write would drop.
    expect(await readRotations(saved, 3)).toEqual([0, 90, 0]);

    // The other file was untouched, so it must still be at version 1.
    await expect(track(page, "sample.pdf")).not.toContainText("v2");
  });

  test("dragging pages between tracks moves them, and an emptied track closes on save", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    const sample = track(page, "sample.pdf");
    await expect(rotated.locator("[data-page-id]")).toHaveCount(4, {
      timeout: 30_000,
    });
    await expect(sample.locator("[data-page-id]")).toHaveCount(1);

    // Move sample.pdf's only page in front of rotated-pages.pdf's first page.
    await dragPageOnto(
      page,
      sample.locator("[data-page-id]").first(),
      rotated.locator("[data-page-id]").first(),
    );

    await expect(rotated.locator("[data-page-id]")).toHaveCount(5);
    await expect(sample.locator("[data-page-id]")).toHaveCount(0);
    // Both tracks are dirty: one gained a page, the other lost its last one.
    await expect(rotated).toContainText("edited");
    await expect(sample).toContainText("edited");

    await page
      .getByRole("button", { name: "Save changes to all files" })
      .click();

    // The emptied file leaves the workbench; the other keeps the moved page.
    await expect(track(page, "sample.pdf")).toHaveCount(0, { timeout: 90_000 });
    const saved = track(page, "rotated-pages.pdf");
    await expect(saved).toContainText("v2");
    await expect(saved.locator("[data-page-id]")).toHaveCount(5);
    // The dragged page landed first, ahead of the original page 1.
    expect(await readRotations(saved, 5)).toEqual([0, 0, 90, 270, 180]);
  });

  test("dragging within a track reorders only that track", async ({ page }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    expect(await readRotations(rotated, 4)).toEqual([0, 90, 270, 180]);

    // Move the last page (180) to the front.
    await dragPageOnto(
      page,
      rotated.locator("[data-page-id]").nth(3),
      rotated.locator("[data-page-id]").first(),
    );

    await expect(rotated.locator("[data-page-id]")).toHaveCount(4);
    expect(await readRotations(rotated, 4)).toEqual([180, 0, 90, 270]);
    await expect(track(page, "sample.pdf")).not.toContainText("edited");
  });

  test("prompts when leaving with pending edits, and can save from the prompt", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    await expect(rotated.locator("[data-page-id]")).toHaveCount(4, {
      timeout: 30_000,
    });

    const last = rotated.locator("[data-page-id]").nth(3);
    await last.hover();
    await last.getByRole("button", { name: "Delete page" }).click();
    await expect(rotated.locator("[data-page-id]")).toHaveCount(3);

    await switchView(page, "Active Files");

    await expect(
      page.getByRole("heading", { name: "Unsaved Changes" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save & Leave" }).click();

    // Back in the editor, the delete is now version 2 rather than pending.
    await switchView(page, "Page Editor");
    const saved = track(page, "rotated-pages.pdf");
    await expect(saved).toContainText("v2", { timeout: 90_000 });
    await expect(saved.locator("[data-page-id]")).toHaveCount(3);
    await expect(saved).not.toContainText("edited");
  });

  test("the insertion line marks where a right-to-left drag actually lands", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    expect(await readRotations(rotated, 4)).toEqual([0, 90, 270, 180]);

    const tiles = rotated.locator("[data-page-id]");
    const second = tiles.nth(1);
    const secondId = await second.getAttribute("data-page-id");

    // Drag page 4 leftwards, crossing page 2's right half before settling on
    // its left half. The line must follow the pointer across the midpoint, not
    // stay where the tile was first entered.
    await dragPageOver(page, tiles.nth(3), second, 0.25);
    await expect(dropTarget(page)).toHaveAttribute(
      "data-page-id",
      secondId as string,
    );

    await page.mouse.up();

    // And the drop lands exactly where the line was: 180 ahead of 90.
    expect(await readRotations(rotated, 4)).toEqual([0, 180, 90, 270]);
  });

  test("the insertion line follows the pointer past a tile's midpoint", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    expect(await readRotations(rotated, 4)).toEqual([0, 90, 270, 180]);

    const tiles = rotated.locator("[data-page-id]");
    const thirdId = await tiles.nth(2).getAttribute("data-page-id");

    // Settling on page 2's RIGHT half must mark page 3 instead, since the page
    // is inserted after page 2.
    await dragPageOver(page, tiles.nth(3), tiles.nth(1), 0.75);
    await expect(dropTarget(page)).toHaveAttribute(
      "data-page-id",
      thirdId as string,
    );

    await page.mouse.up();
    expect(await readRotations(rotated, 4)).toEqual([0, 90, 180, 270]);
  });

  test("clicking pages accumulates the selection instead of replacing it", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    const tiles = rotated.locator("[data-page-id]");
    await expect(tiles).toHaveCount(4, { timeout: 30_000 });
    const selected = rotated.locator('[data-page-id][data-selected="true"]');

    await tiles.nth(0).click();
    await expect(selected).toHaveCount(1);

    // The second click must ADD, not move the selection onto page 2.
    await tiles.nth(1).click();
    await expect(selected).toHaveCount(2);

    // Clicking a selected page takes it back out again.
    await tiles.nth(1).click();
    await expect(selected).toHaveCount(1);
    await expect(tiles.nth(0)).toHaveAttribute("data-selected", "true");

    // Shift extends from the last clicked page across the whole run.
    await tiles.nth(3).click({ modifiers: ["Shift"] });
    await expect(selected).toHaveCount(4);

    // A selection spanning tracks is allowed too.
    const sample = track(page, "sample.pdf");
    await sample.locator("[data-page-id]").first().click();
    await expect(
      page.locator('[data-page-id][data-selected="true"]'),
    ).toHaveCount(5);
  });

  test("a bar action applies to every page the clicks accumulated", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    const tiles = rotated.locator("[data-page-id]");
    expect(await readRotations(rotated, 4)).toEqual([0, 90, 270, 180]);

    await tiles.nth(0).click();
    await tiles.nth(2).click();
    await page.getByRole("button", { name: "Rotate right" }).first().click();

    // Only the two clicked pages turn; the ones in between are untouched.
    expect(await readRotations(rotated, 4)).toEqual([90, 90, 0, 180]);
  });

  test("clicking the empty space around the pages deselects everything", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    const tiles = rotated.locator("[data-page-id]");
    await expect(tiles).toHaveCount(4, { timeout: 30_000 });
    const anySelected = page.locator('[data-page-id][data-selected="true"]');

    await tiles.nth(0).click();
    await tiles.nth(2).click();
    await expect(anySelected).toHaveCount(2);

    // The lane runs past its last page; that surface is not a page.
    const box = await rotated.locator("[data-track-lane]").boundingBox();
    if (!box) throw new Error("lane is not laid out");
    const last = await tiles.nth(3).boundingBox();
    if (!last) throw new Error("tile is not laid out");
    await page.mouse.click(
      (last.x + last.width + box.x + box.width) / 2,
      box.y + box.height / 2,
    );
    await expect(anySelected).toHaveCount(0);
  });

  test("a drag that lands on empty lane space keeps the moved selection", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    const sample = track(page, "sample.pdf");
    const tiles = rotated.locator("[data-page-id]");
    await expect(tiles).toHaveCount(4, { timeout: 30_000 });

    await tiles.nth(0).click();
    await tiles.nth(1).click();
    await expect(
      page.locator('[data-page-id][data-selected="true"]'),
    ).toHaveCount(2);

    // sample.pdf has one page, so the lane past it is empty space: the drop
    // releases over the lane, which is also where a deselect click would land.
    await dragPageOnto(
      page,
      tiles.nth(0),
      sample.locator("[data-page-id]").first(),
      0.9,
    );

    await expect(sample.locator("[data-page-id]")).toHaveCount(3);
    await expect(
      page.locator('[data-page-id][data-selected="true"]'),
    ).toHaveCount(2);
  });

  test("a long track mounts only a window of its pages", async ({ page }) => {
    // Built here rather than committed as a fixture: the point is the page
    // COUNT, and 300 pages of real PDF is a lot of bytes to carry in the repo.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 300; i++) {
      doc
        .addPage([595, 842])
        .drawText(`page ${i}`, { x: 60, y: 700, size: 28, font });
    }
    const longPdf = path.join(os.tmpdir(), `tracks-long-${process.pid}.pdf`);
    fs.writeFileSync(longPdf, await doc.save());

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/editor", {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await uploadFiles(page, longPdf);
      await dismissTourTooltip(page);
      await switchView(page, "Page Editor");

      const lane = page.locator("[data-track-lane]");
      await expect(page.locator("section[aria-label]").first()).toContainText(
        "300 pages",
        { timeout: 60_000 },
      );

      // Mounting all 300 is what made a click cost ~700ms and a drag ~300ms per
      // pointer move, since every tile is a dnd-kit draggable AND droppable.
      const mounted = await page.locator("[data-page-id]").count();
      expect(mounted).toBeGreaterThan(0);
      expect(mounted).toBeLessThan(40);

      // The window follows the lane's scroll rather than being a fixed prefix.
      const firstBefore = await page
        .locator("[data-page-id]")
        .first()
        .getAttribute("data-page-id");
      await lane.evaluate((el) => {
        el.scrollLeft = 9000;
      });
      await expect
        .poll(
          async () =>
            page.locator("[data-page-id]").first().getAttribute("data-page-id"),
          { timeout: 30_000 },
        )
        .not.toBe(firstBefore);
      expect(await page.locator("[data-page-id]").count()).toBeLessThan(40);
    } finally {
      fs.rmSync(longPdf, { force: true });
    }
  });

  test("the eye opens that track's file in the viewer", async ({ page }) => {
    await openPageEditor(page);
    const sample = track(page, "sample.pdf");
    await expect(sample.locator("[data-page-id]")).toHaveCount(1, {
      timeout: 30_000,
    });

    // Second track, so landing on the first file would look like success.
    await sample.getByRole("button", { name: "Open in Viewer" }).click();

    await expect(page.getByTestId("page-tracks")).toHaveCount(0);
    await expect(viewerActiveFile(page)).toHaveText("sample.pdf");
  });

  test("the eye prompts when edits are pending, then views the saved version", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    const tiles = rotated.locator("[data-page-id]");
    await expect(tiles).toHaveCount(4, { timeout: 30_000 });

    // Dirty the very file being opened: the save gives it a new id, so the
    // viewer target has to follow the version bump.
    const last = tiles.nth(3);
    await last.hover();
    await last.getByRole("button", { name: "Delete page" }).click();
    await expect(tiles).toHaveCount(3);

    await rotated.getByRole("button", { name: "Open in Viewer" }).click();

    await expect(
      page.getByRole("heading", { name: "Unsaved Changes" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Save & Leave" }).click();

    // Landed in the viewer on the file the eye named. Saving gives every
    // changed file a NEW id, and the viewer drops an active file that has left
    // the workbench, so this only holds if the target is re-pointed.
    await expect(page.getByTestId("page-tracks")).toHaveCount(0, {
      timeout: 90_000,
    });
    await expect(viewerActiveFile(page)).toHaveText("rotated-pages.pdf", {
      timeout: 60_000,
    });

    // And the pending edit was written rather than dropped.
    await switchView(page, "Page Editor");
    const saved = track(page, "rotated-pages.pdf");
    await expect(saved).toContainText("v2", { timeout: 90_000 });
    await expect(saved.locator("[data-page-id]")).toHaveCount(3);
  });

  test("dragging a track header reorders the tracks", async ({ page }) => {
    await openPageEditor(page);
    await expect(
      track(page, "sample.pdf").locator("[data-page-id]"),
    ).toHaveCount(1, { timeout: 30_000 });
    expect(await trackOrder(page)).toEqual(["rotated-pages.pdf", "sample.pdf"]);

    // Drop sample.pdf on the top half of rotated-pages.pdf: above it.
    await dragTrackOnto(page, "sample.pdf", "rotated-pages.pdf", 0.2);
    await expect
      .poll(async () => trackOrder(page), { timeout: 30_000 })
      .toEqual(["sample.pdf", "rotated-pages.pdf"]);

    // Pages stayed with their own files rather than moving between tracks.
    await expect(
      track(page, "sample.pdf").locator("[data-page-id]"),
    ).toHaveCount(1);
    await expect(
      track(page, "rotated-pages.pdf").locator("[data-page-id]"),
    ).toHaveCount(4);
    await expect(track(page, "rotated-pages.pdf")).not.toContainText("edited");
  });

  test("reordering tracks keeps pending page edits and their undo history", async ({
    page,
  }) => {
    await openPageEditor(page);
    const rotated = track(page, "rotated-pages.pdf");
    const tiles = rotated.locator("[data-page-id]");
    await expect(tiles).toHaveCount(4, { timeout: 30_000 });

    const last = tiles.nth(3);
    await last.hover();
    await last.getByRole("button", { name: "Delete page" }).click();
    await expect(tiles).toHaveCount(3);

    await dragTrackOnto(page, "sample.pdf", "rotated-pages.pdf", 0.2);
    await expect
      .poll(async () => trackOrder(page), { timeout: 30_000 })
      .toEqual(["sample.pdf", "rotated-pages.pdf"]);

    // The edit is still pending, not silently re-baselined by the reorder.
    const moved = track(page, "rotated-pages.pdf");
    await expect(moved.locator("[data-page-id]")).toHaveCount(3);
    await expect(moved).toContainText("edited");

    // And it is still undoable.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(moved.locator("[data-page-id]")).toHaveCount(4);
    await expect(moved).not.toContainText("edited");
  });
});
