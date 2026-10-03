import fs from "node:fs";
import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function loadViewer(page: import("@playwright/test").Page) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
  const firstPage = page.locator('[data-page-index="0"]').first();
  await expect(firstPage).toBeVisible({ timeout: 30_000 });
  await expect(firstPage.locator(".pdf-selection-layer")).toBeAttached({
    timeout: 15_000,
  });
  await page.waitForTimeout(2_000);
  return firstPage;
}

async function markRedaction(page: import("@playwright/test").Page) {
  const firstPage = page.locator('[data-page-index="0"]').first();
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");
  const y = box.y + box.height * 0.105;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();
  const redactInMenu = page
    .locator('[data-text-selection-menu] button[aria-label="Redact"]')
    .first();
  await expect(redactInMenu).toBeVisible({ timeout: 5_000 });
  await redactInMenu.click();
  await page.waitForTimeout(1_500);
}

/** Annotations per page of the saved file. sample.pdf has none, so any count
 *  left after applying means a redaction mark survived as a stale object. */
async function exportAndCountAnnotations(
  page: import("@playwright/test").Page,
  target: string,
): Promise<number[]> {
  // Exported once, outside any poll: a retrying poll would click export again
  // and leave a download per attempt behind.
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page
    .getByRole("button", { name: /download|export/i })
    .first()
    .click();
  const download = await downloadPromise;
  await download.saveAs(target);
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const exported = await PDFDocument.load(fs.readFileSync(target));
  return exported.getPages().map((entry) => entry.node.Annots()?.size() ?? 0);
}

test("manual redaction offers a single apply-and-save action", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await loadViewer(page);
  await markRedaction(page);

  await expect(
    page.getByRole("button", { name: /Apply Redactions/ }).first(),
  ).toBeVisible({ timeout: 10_000 });
  // Applying redactions owns the save now; no second button may remain.
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    0,
  );
});

test("applying redactions saves a clean document without stale objects", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const firstPage = await loadViewer(page);
  await markRedaction(page);

  const apply = page.getByRole("button", { name: /Apply Redactions/ }).first();
  await expect(apply).toBeVisible({ timeout: 10_000 });
  await apply.click();

  // Applying commits and saves in one action: the pending set clears, no save
  // button appears, and the redacted text is gone from the live document.
  await expect(page.getByText(/Apply Redactions/).first()).not.toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    0,
  );
  await expect
    .poll(async () => (await firstPage.innerText()).includes("Test document"), {
      timeout: 15_000,
    })
    .toBe(false);

  // The persisted file carries no annotation: the mark was burned in, not left
  // as a stale object for a second save.
  const counts = await exportAndCountAnnotations(
    page,
    testInfo.outputPath("redact-single-save.pdf"),
  );
  expect(counts).toEqual([0]);

  // Nothing is unsaved after the apply; leaving must not warn.
  await page.getByRole("button", { name: "Form Editor" }).first().click();
  await expect(page.getByText("Unsaved changes").first()).not.toBeVisible({
    timeout: 5_000,
  });
});

/** Drags out a redaction mark at a given height fraction. */
async function markRedactionAt(
  page: import("@playwright/test").Page,
  yFraction: number,
) {
  const firstPage = page.locator('[data-page-index="0"]').first();
  const box = await firstPage.boundingBox();
  if (!box) throw new Error("Page wrapper has no bounding box");
  const y = box.y + box.height * yFraction;
  await page.mouse.move(box.x + box.width * 0.15, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 15 });
  await page.mouse.up();

  // The reader offers Redact on the text-selection menu. Once redaction mode is
  // armed (which the first mark does) the drag itself queues the mark and no
  // menu appears, so both paths have to be handled.
  const redactInMenu = page
    .locator('[data-text-selection-menu] button[aria-label="Redact"]')
    .first();
  if (await redactInMenu.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await redactInMenu.click();
  }
  await page.waitForTimeout(1_500);
}

/**
 * Adds redaction marks until the apply action reports `target`, so the test does
 * not depend on which lines of the sample happen to carry text.
 */
async function markRedactionsUpTo(
  page: import("@playwright/test").Page,
  target: number,
) {
  const apply = page.getByRole("button", { name: /Apply Redactions/ }).first();
  await expect(apply).toBeVisible({ timeout: 10_000 });
  for (const yFraction of [0.105, 0.16, 0.22, 0.28, 0.34, 0.4, 0.46]) {
    if ((await apply.textContent())?.includes(`(${target})`)) return;
    await markRedactionAt(page, yFraction);
  }
  await expect(apply).toContainText(`(${target})`);
}

test("one apply burns in every pending mark", async ({ page }) => {
  test.setTimeout(300_000);
  await loadViewer(page);
  await markRedaction(page);
  await markRedactionsUpTo(page, 2);

  // Both marks are counted, so the user can see the apply covers all of them.
  const apply = page.getByRole("button", { name: /Apply Redactions/ }).first();
  await expect(apply).toContainText("(2)");
  await apply.click();

  // A single apply clears every pending mark, not just the selected one.
  await expect(page.getByText(/Apply Redactions/).first()).not.toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    0,
  );
});

test("a double click on apply does not start two commit/save passes", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await loadViewer(page);
  await markRedaction(page);

  const apply = page.getByRole("button", { name: /Apply Redactions/ }).first();
  await expect(apply).toBeVisible({ timeout: 10_000 });

  // The apply is permanent and irreversible, so the second click has to be
  // swallowed rather than running a second commit/save over the same marks.
  await apply.dblclick({ delay: 10 }).catch(() => {
    // The button disables itself mid-flight, which can abort the dblclick; that
    // is the protection working.
  });

  await expect(
    page.getByText(/Apply Redactions|Applying/).first(),
  ).not.toBeVisible({
    timeout: 30_000,
  });
  // A failed second pass would leave the action available with the marks gone.
  await expect(page.getByRole("button", { name: "Save Changes" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
});
