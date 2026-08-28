import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import {
  downloadBytes,
  saveAndDownload,
} from "@app/tests/stubbed/v2SaveHelpers";

// Opening a file and pressing save is not an edit, so it must not rewrite the
// file. Routed through the full PDFium serialiser it changed the bytes of 8 of
// this suite's 10 fixtures: paragraph-sample 1390 -> 1884 (+35.5%),
// justified-sample +33.4%. paragraph-sample carries the largest signal.
//
// Gating on `dirty` instead is a trap - it clears on save, so a second save
// after a real edit hands back the pre-edit bytes and silently reverts the
// user's work. The second test is that regression.

const FIX = (n: string): string =>
  path.join(import.meta.dirname, "../test-fixtures", n);

// +35.5% through the unfixed serialiser - the loudest case in the fixture set.
const SAMPLE = FIX("paragraph-sample.pdf");

const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

async function open(page: Page, file: string): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(
    () =>
      ((
        window as unknown as {
          __v2_editor_store?: { state: { pages: { runs: unknown[] }[] } };
        }
      ).__v2_editor_store?.state.pages[0]?.runs.length ?? 0) > 0,
    undefined,
    { timeout: 60_000 },
  );
  await page.waitForTimeout(500);
}

/** Type `text` at the end of the first run on page 0 and commit it. */
async function editFirstRun(page: Page, text: string): Promise<void> {
  const run = page.locator('[data-testid^="v2-run-p0-"]').first();
  await run.click();
  await page.keyboard.press("End");
  await page.keyboard.type(text, { delay: 25 });
  await page
    .locator('[data-testid="v2-page-0"]')
    .click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(600);
}

test.describe("v2 editor - an unedited save does not rewrite the file", () => {
  test("saving without editing returns the opened bytes untouched", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await open(page, SAMPLE);

    const source = readFileSync(SAMPLE);
    const saved = await downloadBytes(await saveAndDownload(page, false));

    // eslint-disable-next-line no-console
    console.log(
      `PRISTINE source=${source.length} saved=${saved.length} ` +
        `grow=${(((saved.length - source.length) / source.length) * 100).toFixed(1)}%`,
    );

    expect(
      saved.length,
      `an unedited save resized the file from ${source.length} to ${saved.length} bytes`,
    ).toBe(source.length);
    expect(sha(saved), "an unedited save changed the file's bytes").toBe(
      sha(source),
    );
  });

  test("a second save after an edit still carries the edit", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await open(page, SAMPLE);

    const source = readFileSync(SAMPLE);
    const marker = "ZQXMARK";
    await editFirstRun(page, marker);

    const first = await downloadBytes(await saveAndDownload(page, false));
    // No further edit between the two saves: this is exactly the state in
    // which a dirty-flag-based shortcut would fall back to the opened bytes.
    const second = await downloadBytes(await saveAndDownload(page, false));

    // eslint-disable-next-line no-console
    console.log(
      `POSTEDIT source=${source.length} first=${first.length} second=${second.length}`,
    );

    expect(
      sha(first),
      "the first save after an edit was byte-identical to the source",
    ).not.toBe(sha(source));
    expect(
      sha(second),
      `the second save reverted to the ${source.length}-byte source file`,
    ).not.toBe(sha(source));
    // Both saves must describe the same edited document.
    expect(
      Math.abs(second.length - first.length),
      "the second save's size drifted far from the first's",
    ).toBeLessThan(first.length * 0.05);
  });
});
