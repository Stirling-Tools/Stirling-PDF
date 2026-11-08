import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import {
  installTauri,
  gotoFiles,
  openCard,
  stage,
  dismissModals,
} from "@editor/tests/helpers/tauriDiskStub";
import fs from "node:fs";
import path from "node:path";

// Save in the desktop build: the toolbar marks unsaved disk edits, Save As lives
// in "More save options", and Ctrl+S writes the file back in place.
test.use({ filesViewMode: "grid" });

const FIXTURES = path.resolve("src/editor/core/tests/test-fixtures");
const PDF = Array.from(
  fs.readFileSync(path.join(FIXTURES, "annotation-text-sample.pdf")),
);
const REPORT = "C:/Docs/quarterly-report.pdf";
const MTIME = 1_700_000_000_000;

async function requireDiskLinking(page: Page) {
  const invoked = await page.evaluate(
    () => (window as unknown as { __invoked?: string[] }).__invoked ?? [],
  );
  test.skip(
    !invoked.includes("file_disk_state"),
    "needs the desktop build (vite --mode desktop)",
  );
}

const written = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __writtenPaths?: string[] }).__writtenPaths ?? [],
  );

async function openDirtyReport(page: Page) {
  await installTauri(page);
  await gotoFiles(page);
  await stage(page, { [REPORT]: { bytes: PDF, modifiedMs: MTIME } }, [
    {
      id: "f-report",
      name: "quarterly-report.pdf",
      path: REPORT,
      bytes: PDF,
      isDirty: true,
    },
  ]);
  await dismissModals(page);
  await requireDiskLinking(page);
  await openCard(page, "quarterly-report.pdf");
}

test.describe("Saving files that live on disk", () => {
  test("the toolbar marks unsaved disk edits and Ctrl+S saves in place", async ({
    page,
  }) => {
    await openDirtyReport(page);

    const save = page.getByRole("button", { name: "Save", exact: true });
    await expect(save).toBeVisible({ timeout: 20_000 });
    await expect(save.locator(".workbench-bar-unsaved-dot")).toBeVisible();

    await page.keyboard.press("Control+s");
    await expect.poll(() => written(page)).toContain(REPORT);
    await expect(save.locator(".workbench-bar-unsaved-dot")).toHaveCount(0);
  });

  test("Save As moves into More save options", async ({ page }) => {
    await openDirtyReport(page);

    await expect(page.getByRole("button", { name: "Save As" })).toHaveCount(0);
    await page.getByRole("button", { name: "More save options" }).click();
    await expect(
      page.getByRole("menuitem", { name: /Save a copy somewhere else/ }),
    ).toBeVisible();
  });

  test("a narrow window marks unsaved disk edits in More actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 740, height: 900 });
    await openDirtyReport(page);

    const more = page.getByRole("button", { name: "More actions" });
    await expect(more.locator(".workbench-bar-unsaved-dot")).toBeVisible({
      timeout: 20_000,
    });
    await more.click();
    await expect(
      page
        .getByRole("menuitem", { name: "Save", exact: true })
        .locator(".workbench-bar-menu-unsaved-dot"),
    ).toBeVisible();
  });
});
