import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// The font-size box went disabled the moment a selection held two different
// sizes, so the one control that could make a mixed selection uniform was the
// one control you could not reach. The family picker has always handled the
// same case by showing "Mixed" and staying usable; the size box now matches.
//
// The assertions below are on the MODEL sizes after the change plus the ink
// the page actually rendered, not on the input's own value.

const FIX = (n: string): string =>
  path.join(import.meta.dirname, "../test-fixtures", n);

interface RunInfo {
  id: string;
  size: number;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
}

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
  await page.waitForTimeout(800);
}

async function runsOnPage0(page: Page): Promise<RunInfo[]> {
  return page.evaluate(() => {
    const store = (
      window as unknown as {
        __v2_editor_store: {
          state: {
            pages: {
              runs: { id: string; fontSize: number; text: string }[];
            }[];
          };
        };
      }
    ).__v2_editor_store;
    const out: RunInfo[] = [];
    for (const r of store.state.pages[0]?.runs ?? []) {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-run-${r.id}"]`,
      );
      if (!el) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4) continue;
      out.push({
        id: r.id,
        size: r.fontSize,
        text: r.text,
        rect: { x: b.x, y: b.y, width: b.width, height: b.height },
      });
    }
    return out;
  }) as Promise<RunInfo[]>;
}

interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Grab the band's pixels and stash them in the page, or - once a snapshot is
// already stashed - report the share of pixels that differ from it.
//
// A dark-pixel COUNT is the wrong instrument on this fixture: the band also
// holds page artwork, so 208k pixels were already dark and resizing the two
// runs moved the count by 1%. Glyphs that move and grow change a large share
// of the pixels whatever is behind them.
const BAND_FN = (c: Clip & { mode: "snap" | "diff" }): number => {
  const canvas = document
    .querySelector<HTMLElement>('[data-testid="v2-page-0"]')
    ?.querySelector("canvas");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return -1;
  const cb = canvas.getBoundingClientRect();
  const sx = canvas.width / cb.width;
  const sy = canvas.height / cb.height;
  const x0 = Math.max(0, Math.floor((c.x - cb.left) * sx));
  const y0 = Math.max(0, Math.floor((c.y - cb.top) * sy));
  const x1 = Math.min(canvas.width, Math.ceil((c.x + c.width - cb.left) * sx));
  const y1 = Math.min(canvas.height, Math.ceil((c.y + c.height - cb.top) * sy));
  if (x1 <= x0 || y1 <= y0) return -1;
  const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const w = window as unknown as { __band?: Uint8ClampedArray };
  if (c.mode === "snap") {
    w.__band = new Uint8ClampedArray(d);
    return d.length / 4;
  }
  const prev = w.__band;
  if (!prev || prev.length !== d.length) return -1;
  let changed = 0;
  for (let i = 0; i < d.length; i += 4) {
    // 24 tolerates antialiasing jitter without hiding a real glyph change.
    if (
      Math.abs(d[i] - prev[i]) > 24 ||
      Math.abs(d[i + 1] - prev[i + 1]) > 24 ||
      Math.abs(d[i + 2] - prev[i + 2]) > 24
    ) {
      changed++;
    }
  }
  return changed / (d.length / 4);
};

/** Union of two run boxes, padded so grown glyphs stay inside the window. */
function bandAround(a: RunInfo, b: RunInfo, pad = 40): Clip {
  const x = Math.min(a.rect.x, b.rect.x) - pad;
  const y = Math.min(a.rect.y, b.rect.y) - pad;
  const right =
    Math.max(a.rect.x + a.rect.width, b.rect.x + b.rect.width) + pad;
  const bottom =
    Math.max(a.rect.y + a.rect.height, b.rect.y + b.rect.height) + pad;
  return { x, y, width: right - x, height: bottom - y };
}

const clickRun = async (page: Page, r: RunInfo, shift: boolean) => {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(
    r.rect.x + r.rect.width / 2,
    r.rect.y + r.rect.height / 2,
  );
  if (shift) await page.keyboard.up("Shift");
  await page.mouse.move(20, 20);
  await page.waitForTimeout(200);
};

test.describe("v2 editor - font size on a mixed-size selection", () => {
  test("the size box stays usable and applies to every selected run", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await open(page, FIX("stirling-marketing.pdf"));

    const runs = await runsOnPage0(page);
    const first = runs[0];
    expect(first, "fixture rendered no runs").toBeTruthy();
    const other = runs.find((r) => Math.abs(r.size - first.size) > 1);
    expect(
      other,
      `fixture has no two runs of different size (sizes seen: ${[
        ...new Set(runs.map((r) => r.size.toFixed(1))),
      ].join(", ")})`,
    ).toBeTruthy();

    // eslint-disable-next-line no-console
    console.log(
      `MIXEDSIZE a=${first.size.toFixed(2)} "${first.text.slice(0, 24)}" ` +
        `b=${other!.size.toFixed(2)} "${other!.text.slice(0, 24)}"`,
    );

    const band = bandAround(first, other!);
    const sampled = await page.evaluate(BAND_FN, { ...band, mode: "snap" });
    expect(sampled, "the band sampled no canvas pixels").toBeGreaterThan(200);

    // Control: how much this band moves when nothing is done to it. Without
    // this the "did it re-render" threshold below would be a guessed number.
    await page.waitForTimeout(900);
    const idle = await page.evaluate(BAND_FN, { ...band, mode: "diff" });

    await clickRun(page, first, false);
    await clickRun(page, other!, true);
    const ids = await page.evaluate(
      () =>
        (
          window as unknown as {
            __v2_editor_store: { selection: { state: { runIds: string[] } } };
          }
        ).__v2_editor_store.selection.state.runIds,
    );
    expect(ids.length, "shift-click did not build a two-run selection").toBe(2);

    const box = page.getByTestId("v2-font-size");
    await expect(
      box,
      "the size box is disabled for a mixed-size selection",
    ).toBeEnabled();
    // Blank, not one of the two sizes presented as if it were both.
    await expect(
      box,
      "the box shows one run's size as if it were all",
    ).toHaveValue("");

    // Re-snap once the runs are selected, so the diff below measures the
    // resize and not the selection highlight.
    await page.evaluate(BAND_FN, { ...band, mode: "snap" });

    await box.fill("30");
    await page.waitForTimeout(900);

    const after = await runsOnPage0(page);
    const sizes = [first.id, other!.id].map(
      (id) => after.find((r) => r.id === id)?.size ?? -1,
    );
    // eslint-disable-next-line no-console
    console.log(`MIXEDSIZE applied=${JSON.stringify(sizes)}`);
    for (const s of sizes) {
      expect(s, `a selected run kept its old size (got ${s})`).toBeCloseTo(
        30,
        0,
      );
    }

    // The page really re-rendered at the new size, not just the model.
    const changed = await page.evaluate(BAND_FN, { ...band, mode: "diff" });
    // eslint-disable-next-line no-console
    console.log(
      `MIXEDSIZE bandChanged=${(changed * 100).toFixed(2)}% idle=${(idle * 100).toFixed(2)}%`,
    );
    expect(
      changed,
      `the resize moved ${(changed * 100).toFixed(2)}% of the band's pixels, barely above the ${(idle * 100).toFixed(2)}% an untouched page moves`,
    ).toBeGreaterThan(Math.max(0.01, idle * 8));

    // With both runs at 30 the selection is uniform again, so the box shows it.
    await expect(box).toHaveValue("30");
  });
});
