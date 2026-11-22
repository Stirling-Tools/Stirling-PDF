import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
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

async function openEditor(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await openInTextEditor(page, file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await expect
    .poll(() => readRuns(page), { timeout: 30_000 })
    .not.toHaveLength(0);
}

interface RunInfo {
  id: string;
  fontId: string;
}

/** Every run on page 0, with the font id the model holds for it. */
function readRuns(page: import("@playwright/test").Page): Promise<RunInfo[]> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __editor_store: {
        state: { pages: { runs: { id: string; fontId: string }[] }[] };
      };
    };
    return w.__editor_store.state.pages[0].runs.map((r) => ({
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
      __editor_store: {
        state: { pages: { runs: { id: string; fontId: string }[] }[] };
      };
    };
    for (const p of w.__editor_store.state.pages) {
      const r = p.runs.find((x) => x.id === rid);
      if (r) return r.fontId;
    }
    return null;
  }, runId);
}

function slantOf(
  page: import("@playwright/test").Page,
  runId: string,
): Promise<number | null> {
  return page.evaluate((rid) => {
    const w = window as unknown as {
      __editor_store: {
        state: {
          pages: {
            runs: { id: string; matrix: { c: number; d: number } }[];
          }[];
        };
      };
    };
    for (const p of w.__editor_store.state.pages) {
      const r = p.runs.find((x) => x.id === rid);
      if (r) return r.matrix.c / r.matrix.d;
    }
    return null;
  }, runId);
}

function textRange(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __editor_store: {
            selection: { value: { textRange?: unknown } };
          };
        }
      ).__editor_store.selection.value.textRange ?? null,
  );
}

async function embeddedRun(page: import("@playwright/test").Page) {
  const runs = await readRuns(page);
  const embedded = runs.find((r) => !/^(base14|device):/.test(r.fontId));
  expect(
    embedded,
    `fixture should hold an embedded font run, got ${runs.map((r) => r.fontId).join(", ")}`,
  ).toBeTruthy();
  return embedded!;
}

test.describe("PDF text editor - font capability gating", () => {
  test("italic leans a font that has no italic version and keeps its typeface", async ({
    page,
  }) => {
    await openEditor(page, SUBSET_PDF);
    const embedded = await embeddedRun(page);

    await page.locator(`[data-testid="pdf-editor-run-${embedded.id}"]`).click();
    const italic = page.getByTestId("pdf-editor-italic");
    await expect(italic).toBeEnabled();
    await expect(italic).toHaveAttribute("aria-pressed", "false");
    await italic.click();

    await expect(italic).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => slantOf(page, embedded.id))
      .toBeCloseTo(Math.tan((12 * Math.PI) / 180), 2);
    expect(
      await fontIdOf(page, embedded.id),
      "italic swapped the typeface instead of leaning it",
    ).toBe(embedded.fontId);

    await italic.click();
    await expect(italic).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => slantOf(page, embedded.id)).toBeCloseTo(0, 3);
  });

  test("says WHY italic is unavailable for part of a run in a font with no italic version", async ({
    page,
  }) => {
    await openEditor(page, SUBSET_PDF);
    const embedded = await embeddedRun(page);
    const box = page.locator(`[data-testid="pdf-editor-run-${embedded.id}"]`);

    await box.click({ position: { x: 4, y: 4 } });
    await box.dblclick();
    await expect.poll(() => textRange(page)).not.toBeNull();

    const italic = page.getByTestId("pdf-editor-italic");
    await expect(italic).toBeDisabled();
    // Chromium drops events aimed AT a disabled button, so the tooltip only
    // survives because the pointer lands on the icon child and bubbles.
    await italic.hover();

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            [...document.querySelectorAll(".mantine-Tooltip-tooltip")]
              .map((n) => (n as HTMLElement).innerText)
              .join(" | "),
          ),
        { message: "a disabled control with no explanation just looks broken" },
      )
      .toContain("No italic in this font");
  });

  test("italic still works once the run is on a base-14 family", async ({
    page,
  }) => {
    await openEditor(page, PARAGRAPH_PDF);

    const runs = await readRuns(page);
    expect(runs.length).toBeGreaterThan(0);
    const target = runs[0];
    await page.locator(`[data-testid="pdf-editor-run-${target.id}"]`).click();
    await page.waitForTimeout(400);

    const picker = page.getByTestId("pdf-editor-font-family");
    await picker.click();
    await page.getByRole("option", { name: "Helvetica", exact: true }).click();
    await page.waitForTimeout(1500);

    const italic = page.getByTestId("pdf-editor-italic");
    await expect(italic).toBeEnabled();
    await italic.click();
    await page.waitForTimeout(1500);

    expect(await fontIdOf(page, target.id)).toMatch(/italic|oblique/i);
  });
});
