import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// The italic button answered for every font, including ones we cannot make
// italic. Its handler ended in `?? helveticaWith(...)`, so clicking it on a
// subset-embedded face threw the document's typeface away and replaced it with
// Helvetica-Oblique - silently, and with the button looking perfectly enabled.
//
// A style we cannot actually produce must not be offered.

const SUBSET_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/subset-font-sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

async function openV2(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(file);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
}

interface RunInfo {
  id: string;
  fontId: string;
}

/** Every run on page 0, with the font id the model holds for it. */
function readRuns(page: import("@playwright/test").Page): Promise<RunInfo[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __v2_editor_store: {
        state: { pages: { runs: { id: string; fontId: string }[] }[] };
      };
    };
    return w.__v2_editor_store.state.pages[0].runs.map((r) => ({
      id: r.id,
      fontId: r.fontId,
    }));
  });
}

function fontIdOf(
  page: import("@playwright/test").Page,
  runId: string,
): Promise<string | null> {
  return page.evaluate((rid) => {
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
  }, runId);
}

test.describe("v2 editor - font capability gating", () => {
  test("italic is disabled for a font that has no italic version", async ({
    page,
  }) => {
    await openV2(page, SUBSET_PDF);

    const runs = await readRuns(page);
    // Not base-14 and no device fonts loaded: there is no italic cut to reach.
    const embedded = runs.find((r) => !/^(base14|device):/.test(r.fontId));
    expect(
      embedded,
      `fixture should hold an embedded font run, got ${runs.map((r) => r.fontId).join(", ")}`,
    ).toBeTruthy();

    await page.locator(`[data-testid="v2-run-${embedded!.id}"]`).click();
    await page.waitForTimeout(400);

    const italic = page.getByTestId("v2-italic");
    await expect(italic).toBeVisible();
    await expect(
      italic,
      `italic offered for ${embedded!.fontId}, which has no italic face`,
    ).toBeDisabled();
  });

  test("says WHY italic is unavailable", async ({ page }) => {
    await openV2(page, SUBSET_PDF);

    const runs = await readRuns(page);
    const embedded = runs.find((r) => !/^(base14|device):/.test(r.fontId));
    expect(embedded).toBeTruthy();

    await page.locator(`[data-testid="v2-run-${embedded!.id}"]`).click();
    await page.waitForTimeout(400);

    const italic = page.getByTestId("v2-italic");
    await expect(italic).toBeDisabled();
    // Chromium drops events aimed AT a disabled button, so the tooltip only
    // survives because the pointer lands on the icon child and bubbles.
    await italic.hover();
    await page.waitForTimeout(1000);

    const tips = await page.evaluate(() =>
      [...document.querySelectorAll(".mantine-Tooltip-tooltip")]
        .map((n) => (n as HTMLElement).innerText)
        .join(" | "),
    );
    expect(
      tips,
      "a disabled control with no explanation just looks broken",
    ).toContain("no italic version");
  });

  test("italic never swaps an embedded font for Helvetica", async ({
    page,
  }) => {
    await openV2(page, SUBSET_PDF);

    const runs = await readRuns(page);
    const embedded = runs.find((r) => !/^(base14|device):/.test(r.fontId));
    expect(embedded).toBeTruthy();
    const before = embedded!.fontId;

    await page.locator(`[data-testid="v2-run-${embedded!.id}"]`).click();
    await page.waitForTimeout(400);
    // force: the point is that a disabled button does nothing. On the old code
    // the button was enabled and this click rewrote the font.
    await page.getByTestId("v2-italic").click({ force: true });
    await page.waitForTimeout(1200);

    const after = await fontIdOf(page, embedded!.id);
    expect(
      after,
      `"italic" replaced ${before} with ${after} - a different typeface, not a slant`,
    ).toBe(before);
  });

  test("italic still works once the run is on a base-14 family", async ({
    page,
  }) => {
    await openV2(page, PARAGRAPH_PDF);

    const runs = await readRuns(page);
    expect(runs.length).toBeGreaterThan(0);
    const target = runs[0];
    await page.locator(`[data-testid="v2-run-${target.id}"]`).click();
    await page.waitForTimeout(400);

    // Picking a standard family is the documented way out: from there the
    // italic cut genuinely exists, so the control must come back.
    const picker = page.getByTestId("v2-font-family");
    await picker.click();
    await page.getByRole("option", { name: "Helvetica", exact: true }).click();
    await page.waitForTimeout(1500);

    const italic = page.getByTestId("v2-italic");
    await expect(italic).toBeEnabled();
    await italic.click();
    await page.waitForTimeout(1500);

    expect(await fontIdOf(page, target.id)).toMatch(/italic|oblique/i);
  });
});
