import { test } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import {
  type DiskEntry,
  type SeedFile,
  installTauri,
  editOnDisk,
  deleteOnDisk,
  emitWatch,
  gotoFiles,
  openCard,
  stage,
} from "@app/tests/helpers/tauriDiskStub";
import fs from "node:fs";
import path from "node:path";

/** Capture harness, not a regression test: fakes Tauri IPC over an in-memory disk.
 *  Needs `vite --mode desktop` (for desktopFileLinkingSupported) and SHOT_DIR set. */

const SHOT_DIR = process.env.SHOT_DIR;
// Playwright runs from the editor dir, so this is stable without __dirname
// (the config is ESM, where __dirname does not exist).
const FIXTURES = path.resolve("src/core/tests/test-fixtures");
// 1.08 KB and 1.55 KB - the two sizes the walkthrough quotes for the
// external-edit step, so the numbers on screen match the prose.
const PDF_SMALL = Array.from(
  fs.readFileSync(path.join(FIXTURES, "compare_sample_a.pdf")),
);
const PDF_LARGE = Array.from(
  fs.readFileSync(path.join(FIXTURES, "compare_sample_b.pdf")),
);

const MTIME = 1_700_000_000_000;
const P = {
  report: "C:/Docs/quarterly-report.pdf",
  notes: "C:/Docs/notes.pdf",
  archived: "C:/Docs/archived.pdf",
};

async function shoot(page: Page, name: string, theme: string) {
  if (!SHOT_DIR) return;
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}_${theme}.png`) });
  console.log(`  shot ${name}_${theme}`);
}

const ALL_PRESENT: Record<string, DiskEntry> = {
  [P.report]: { bytes: PDF_SMALL, modifiedMs: MTIME },
  [P.notes]: { bytes: PDF_SMALL, modifiedMs: MTIME },
  [P.archived]: { bytes: PDF_SMALL, modifiedMs: MTIME },
};

const THREE_FILES: SeedFile[] = [
  {
    id: "f-report",
    name: "quarterly-report.pdf",
    path: P.report,
    bytes: PDF_SMALL,
  },
  { id: "f-notes", name: "notes.pdf", path: P.notes, bytes: PDF_SMALL },
  {
    id: "f-archived",
    name: "archived.pdf",
    path: P.archived,
    bytes: PDF_SMALL,
  },
];

test.use({ autoGoto: false, viewport: { width: 2076, height: 1096 } });
test.describe.configure({ mode: "serial", timeout: 240_000 });

// A capture run, not a gate: it needs a desktop-mode dev server and takes
// minutes, so it stays out of the way unless someone asks for the shots.
test.skip(!SHOT_DIR, "set SHOT_DIR to regenerate the walkthrough screenshots");

for (const theme of ["light", "dark"] as const) {
  test(`capture disk-link states (${theme})`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: theme });
    await installTauri(page);

    // 1. Everything in sync
    await gotoFiles(page);
    await stage(page, ALL_PRESENT, THREE_FILES);
    await shoot(page, "01_in_sync", theme);

    // 3. Deleted while the app was closed
    // (before 2, because 2 leaves the workbench populated)
    const withoutArchived = { ...ALL_PRESENT };
    delete withoutArchived[P.archived];
    await stage(page, withoutArchived, THREE_FILES);
    await shoot(page, "03_pruned_after_delete", theme);

    // 2. Edited in another app
    await stage(page, ALL_PRESENT, THREE_FILES);
    await editOnDisk(page, P.report, PDF_LARGE);
    await openCard(page, "quarterly-report.pdf");
    await page.waitForTimeout(2500);
    await shoot(page, "02_external_edit_picked_up", theme);

    // 4. Deleted between listing and clicking
    await stage(page, ALL_PRESENT, THREE_FILES);
    // The list-time check has already passed; now it goes.
    await deleteOnDisk(page, P.notes);
    await openCard(page, "notes.pdf");
    await page.waitForTimeout(2000);
    await shoot(page, "04_vanished_on_open", theme);

    // 5. Deleted while open, caught live by the watcher
    await stage(page, ALL_PRESENT, THREE_FILES);
    await openCard(page, "archived.pdf");
    await page.waitForTimeout(1500);
    await deleteOnDisk(page, P.archived);
    await emitWatch(page, [P.archived]);
    await page.waitForTimeout(2500);
    await shoot(page, "05_open_file_deleted", theme);

    // The badge outlives the toast - go back to the list and show it.
    await gotoFiles(page);
    await page.waitForTimeout(2000);
    await shoot(page, "05b_orphaned_badge", theme);

    // 6. Disk moved on while unsaved edits were held
    await stage(page, ALL_PRESENT, [
      { ...THREE_FILES[0], isDirty: true },
      THREE_FILES[1],
      THREE_FILES[2],
    ]);
    await editOnDisk(page, P.report, PDF_LARGE);
    await openCard(page, "quarterly-report.pdf");
    await page.waitForTimeout(2500);
    await shoot(page, "06_conflict", theme);

    await gotoFiles(page);
    await page.waitForTimeout(2000);
    await shoot(page, "06b_conflict_badge", theme);
  });
}
