import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { PDFDocument } from "@cantoo/pdf-lib";

import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles, dismissTourTooltip } from "@app/tests/helpers/ui-helpers";

// Fixture: 4 portrait pages whose intrinsic /Rotate is 0, 90, 270, 180.
// Page 3 (index 2) is 270 so a single rotate-right lands on a net-0 target -
// the exact case the export used to drop, leaving the source rotation behind.
const ROTATED_PDF = path.join(__dirname, "../test-fixtures/rotated-pages.pdf");
const SOURCE_ROTATIONS = [0, 90, 270, 180];

/** Read the rotation each thumbnail is currently displaying (= page.rotation). */
async function readEditorRotations(page: import("@playwright/test").Page) {
  const imgs = page.locator("[data-page-id] img[data-original-rotation]");
  await expect(imgs).toHaveCount(SOURCE_ROTATIONS.length, { timeout: 30_000 });
  const count = await imgs.count();
  const rots: number[] = [];
  for (let i = 0; i < count; i++) {
    rots.push(
      parseInt(
        (await imgs.nth(i).getAttribute("data-original-rotation")) || "NaN",
        10,
      ),
    );
  }
  return rots;
}

// Skip the fixture's 30s auto-goto; vite's cold on-demand compile can exceed it.
test.use({ autoGoto: false });

test.describe("PageEditor (multitool) rotation save", () => {
  test("rotating a page persists the correct absolute rotation on export", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await uploadFiles(page, ROTATED_PDF);
    // Enter the multitool via in-app navigation, NOT page.goto: a full reload
    // wipes the in-memory workbench before PageEditorContext's "entering page
    // editor" effect can auto-select the file, leaving the editor empty.
    await dismissTourTooltip(page);
    await page.getByText("PDF Multi Tool", { exact: true }).first().click();

    // 1. Baseline: the multitool must seed page.rotation from the source /Rotate,
    //    otherwise rotated pages render upright and every rotate is off-baseline.
    const baseline = await readEditorRotations(page);
    expect(
      baseline,
      "editor must show pages at their true source rotation",
    ).toEqual(SOURCE_ROTATIONS);

    // 2. Rotate page 3 (index 2, source /Rotate 270) right once via its
    //    per-page hover menu. Target rotation is (270 + 90) % 360 = 0.
    const page3 = page.locator("[data-page-id]").nth(2);
    await page3.scrollIntoViewIfNeeded();
    await page3.hover();
    const rotateRight = page3.getByRole("button", { name: "Rotate Right" });
    await expect(rotateRight).toBeVisible({ timeout: 5_000 });
    await rotateRight.click();

    // Only page 3 changes (270 -> 0); the others keep their source rotation.
    await expect(page3.locator("img[data-original-rotation]")).toHaveAttribute(
      "data-original-rotation",
      "0",
      { timeout: 10_000 },
    );
    expect(await readEditorRotations(page)).toEqual([0, 90, 0, 180]);

    // 3. Ensure all pages are selected, then export, capturing the PDF.
    //    Pages load all-selected, so "Select All" is disabled - only click it
    //    if some pages got deselected.
    const selectAll = page.getByRole("button", {
      name: "Select All",
      exact: true,
    });
    if (await selectAll.isEnabled()) {
      await selectAll.click();
    }
    const tmpOut = path.join(os.tmpdir(), `rot-export-${process.pid}.pdf`);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      page.getByRole("button", { name: "Export Selected Pages" }).click(),
    ]);
    await download.saveAs(tmpOut);

    // 4. The exported /Rotate must match what the editor showed: page 3 upright
    //    (0), the untouched pages keeping their source rotation.
    const outDoc = await PDFDocument.load(fs.readFileSync(tmpOut));
    const outRotations = outDoc.getPages().map((p) => p.getRotation().angle);
    fs.rmSync(tmpOut, { force: true });
    expect(outRotations).toEqual([0, 90, 0, 180]);
  });
});
