import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Selecting text set in an embedded or subset face left the font picker showing
// its "Font family" placeholder: the editor knew the run was NotoSubset and told
// the user nothing. Worse, the blank box reads as "no font", inviting a pick that
// substitutes Helvetica for a typeface the document already had.
//
// The picker must name the font it recognised, and must not offer it as a
// re-selectable option unless the real face is actually loadable.

const SUBSET_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/subset-font-sample.pdf",
);

async function openV2(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

/** The first run on page 0 whose font is neither base-14 nor a device face. */
function embeddedRun(
  page: import("@playwright/test").Page,
): Promise<{ id: string; fontId: string } | null> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __v2_editor_store: {
        state: { pages: { runs: { id: string; fontId: string }[] }[] };
      };
    };
    const runs = w.__v2_editor_store.state.pages[0].runs;
    const hit = runs.find((r) => !/^(base14|device):/.test(r.fontId));
    return hit ? { id: hit.id, fontId: hit.fontId } : null;
  });
}

test.describe("v2 editor - document font recognition", () => {
  test("names the document's own font instead of showing a blank picker", async ({
    page,
  }) => {
    await openV2(page, SUBSET_PDF);

    const run = await embeddedRun(page);
    expect(run, "fixture should hold an embedded font run").toBeTruthy();
    // "pdf:<ptr>:<family>" - the part the user should actually be shown.
    const family = run!.fontId.slice(run!.fontId.lastIndexOf(":") + 1);

    await page.locator(`[data-testid="v2-run-${run!.id}"]`).click();
    await page.waitForTimeout(400);

    const picker = page.getByTestId("v2-font-family");
    await expect(picker).toBeVisible();
    await expect(
      picker,
      `picker hid the recognised font ${run!.fontId}, leaving the user guessing`,
    ).toHaveValue(new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  test("does not offer the unloadable document font as a pick", async ({
    page,
  }) => {
    await openV2(page, SUBSET_PDF);

    const run = await embeddedRun(page);
    expect(run).toBeTruthy();
    const before = run!.fontId;
    const family = before.slice(before.lastIndexOf(":") + 1);

    await page.locator(`[data-testid="v2-run-${run!.id}"]`).click();
    await page.waitForTimeout(400);

    // The recognised face must be listed - that is the recognition - and the
    // entry must be inert, since we hold no bytes to actually re-emit with.
    await page.getByTestId("v2-font-family").click();
    await page.waitForTimeout(400);
    const entry = page
      .getByRole("option", { name: new RegExp(`^${family}$`) })
      .first();
    await expect(
      entry,
      `the recognised font ${family} was not listed at all`,
    ).toBeVisible();
    await expect(
      entry,
      `${family} was offered as a pick, but we hold no bytes for it`,
    ).toHaveAttribute("data-combobox-disabled", "true");

    await entry.click({ force: true });
    await page.waitForTimeout(1000);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    const after = await page.evaluate((rid) => {
      const w = window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { id: string; fontId: string }[] }[] };
        };
      };
      for (const p of w.__v2_editor_store.state.pages) {
        const r = p.runs.find((x) => x.id === rid);
        if (r) return r.fontId;
      }
      return null;
    }, run!.id);
    expect(
      after,
      `picking the recognised font rewrote ${before} to ${after}`,
    ).toBe(before);
  });
});
