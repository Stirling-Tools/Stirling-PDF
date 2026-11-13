import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Locator, Page } from "@playwright/test";
import path from "path";
import {
  openRecents,
  switchView,
  uploadFiles,
} from "@editor/tests/helpers/ui-helpers";

// Active Files has no selection UI, so its hidden selection must cover every
// open file: Save acts on the selection whenever there is one.

test.use({ filesViewMode: "grid" });

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const STORED = "sample.pdf";
const UPLOADED = "multi-page-sample.pdf";

function row(page: Page, name: string): Locator {
  return page.locator(".file-sidebar-file-item").filter({ hasText: name });
}

const IN_WORKBENCH = /(^|\s)selected(\s|$)/;

async function closeIntoLibrary(page: Page, name: string): Promise<void> {
  await uploadFiles(page, path.join(FIXTURES_DIR, name));
  await row(page, name).locator(".file-sidebar-file-name").click();
  await expect(row(page, name)).not.toHaveClass(IN_WORKBENCH);
}

// Browser multi-download policies differ, so record what Save hands the
// browser rather than whether the browser accepts every file.
async function recordDownloads(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const names: string[] = [];
    Reflect.set(window, "__downloadNames", names);
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download) names.push(this.download);
      click.call(this);
    };
  });
  return () =>
    page.evaluate(() =>
      [...(Reflect.get(window, "__downloadNames") as string[])].sort(),
    );
}

const reopenStored: Record<string, (page: Page) => Promise<void>> = {
  "its sidebar row": (page) =>
    row(page, STORED).locator(".file-sidebar-file-name").click(),
  "its sidebar eye button": async (page) => {
    await row(page, STORED).hover();
    await row(page, STORED).locator(".file-sidebar-eye-btn").click();
  },
  "the file library": async (page) => {
    await openRecents(page);
    await page
      .locator(".files-page-card")
      .filter({ hasText: STORED })
      .dblclick();
    await expect(page).not.toHaveURL(/\/files/);
  },
};

for (const [via, reopen] of Object.entries(reopenStored)) {
  test(`Save covers a stored file reopened from ${via} and an uploaded one`, async ({
    page,
  }) => {
    await closeIntoLibrary(page, STORED);

    await reopen(page);
    await expect(row(page, STORED)).toHaveClass(IN_WORKBENCH);
    await uploadFiles(page, path.join(FIXTURES_DIR, UPLOADED));
    await expect(row(page, UPLOADED)).toHaveClass(IN_WORKBENCH);

    await switchView(page, "Active Files");
    const downloads = await recordDownloads(page);
    await page.getByRole("button", { name: /^Download (All|Files)$/ }).click();

    await expect.poll(downloads).toEqual([UPLOADED, STORED].sort());
  });
}
