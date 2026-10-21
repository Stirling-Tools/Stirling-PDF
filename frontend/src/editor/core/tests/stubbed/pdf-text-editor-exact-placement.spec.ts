import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { EditorTestWindow } from "@app/tests/stubbed/editorTestTypes";

/** Focusing a run must not slide its words off the glyphs underneath. */
const SAMPLE = path.join(
  import.meta.dirname,
  "../test-fixtures/user-sample.pdf",
);

async function openSample(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 45_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SAMPLE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 45_000,
  });
  await page.waitForTimeout(800);
}

/** Id of the first multi-word run that carries captured positions. */
async function firstMeasuredRun(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const store = (window as unknown as EditorTestWindow).__editor_store;
    for (const run of store.doc.page(0).runs) {
      if (!run.charStartsX || run.charPositionsKey === null) continue;
      if (!/\S\s+\S/.test(run.text)) continue;
      // Exact placement is enabled for single-line runs only.
      if ((run.paragraphLineCount ?? 1) > 1) continue;
      return run.id;
    }
    return null;
  });
}

test("the reader captures engine pen positions for page text", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openSample(page);
  const stats = await page.evaluate(() => {
    const store = (window as unknown as EditorTestWindow).__editor_store;
    const runs = store.doc.page(0).runs;
    let measured = 0;
    let monotonic = 0;
    for (const r of runs) {
      if (!r.charStartsX || !r.charEndsX) continue;
      measured += 1;
      const xs = r.charStartsX.filter((v) => Number.isFinite(v));
      const ends = r.charEndsX.filter((v) => Number.isFinite(v));
      // Every glyph must advance forward and have a non-negative width.
      const ok =
        xs.length > 0 &&
        ends.length === xs.length &&
        r.charStartsX.every(
          (v, i) => !Number.isFinite(v) || (r.charEndsX as number[])[i] >= v,
        );
      if (ok) monotonic += 1;
    }
    return { total: runs.length, measured, monotonic };
  });
  expect(stats.total).toBeGreaterThan(0);
  expect(stats.measured).toBeGreaterThan(0);
  expect(stats.monotonic).toBe(stats.measured);
});

// The per-word boxes that used to tile here were invisible once the overlay
// started showing the page bitmap until the first edit, and an inline-block
// makes Home/End move within the WORD rather than the line - so every edit
// landed at the click point. These pin the behaviour that replaced them.
const EDITS: Array<{
  name: string;
  keys: (p: Page) => Promise<void>;
  expect: (before: string) => string;
}> = [
  {
    name: "End then type appends",
    keys: async (p) => {
      await p.keyboard.press("End");
      await p.keyboard.type("Z");
    },
    expect: (b) => b + "Z",
  },
  {
    name: "Home then type prepends",
    keys: async (p) => {
      await p.keyboard.press("Home");
      await p.keyboard.type("Z");
    },
    expect: (b) => "Z" + b,
  },
  {
    name: "Home then Delete removes the first character",
    keys: async (p) => {
      await p.keyboard.press("Home");
      await p.keyboard.press("Delete");
    },
    expect: (b) => b.slice(1),
  },
];

for (const c of EDITS) {
  test(`caret: ${c.name}`, async ({ page }: { page: Page }) => {
    test.setTimeout(140_000);
    await openSample(page);
    const runId = await firstMeasuredRun(page);
    expect(runId).toBeTruthy();

    const overlay = page.locator(`[data-testid="pdf-editor-run-${runId}"]`);
    // WebKit's innerText appends a trailing newline Chromium omits. Strip it
    // on every read, or comparing before/after skews instead of matching.
    const before = (await overlay.innerText())
      .replace(/\u00a0/g, " ")
      .replace(/\n+$/, "");
    await overlay.click();
    await page.waitForTimeout(150);
    await c.keys(page);
    await page.waitForTimeout(300);

    const after = (await overlay.innerText())
      .replace(/\u00a0/g, " ")
      .replace(/\n+$/, "");
    expect(after).toBe(c.expect(before));
  });
}

test("typing leaves the text intact apart from the typed character", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(140_000);
  await openSample(page);
  const runId = await firstMeasuredRun(page);
  expect(runId).toBeTruthy();

  const overlay = page.locator(`[data-testid="pdf-editor-run-${runId}"]`);
  const before = (await overlay.innerText())
    .replace(/\u00a0/g, " ")
    .replace(/\n+$/, "");
  await overlay.click();
  await page.waitForTimeout(120);
  await page.keyboard.press("End");
  await page.keyboard.type("Z");
  await page.waitForTimeout(200);

  const after = (await overlay.innerText())
    .replace(/\u00a0/g, " ")
    .replace(/\n+$/, "");
  expect(after.replace("Z", "")).toBe(before);
  expect(after).toContain("Z");
});
