import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import { readFile } from "node:fs/promises";
import { waitForEditorReady } from "@app/tests/stubbed/editorReady";
import {
  downloadBytes,
  saveAndDownload,
  stashCurrentDocument,
  waitForReopenedPage,
} from "@app/tests/stubbed/saveHelpers";

// Editing OCR text on a scanned page. OCR adds invisible text (Tr 3) under or
// over the scan image, so re-emitting it invisibly changed nothing on screen.
// The edit must cover the changed words' scanned glyphs and draw the new text
// visibly, while unchanged words keep their scanned pixels.
//
// Both fixtures are the same 150dpi greyscale scan, OCR'd offline by ocrmypdf
// 17 with the two renderers Stirling's OCR tool offers (hocr, sandwich).

const FIX = (n: string) =>
  path.join(import.meta.dirname, "../test-fixtures", n);

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface RunState {
  id: string;
  text: string;
  renderMode: number;
}

const PAGE_TESTID = "pdf-editor-page-0";

// Keep a copy of the page bitmap on window so diffs stay in-page.
async function snap(page: Page, name: string): Promise<void> {
  await page.evaluate(
    ({ tid, n }) => {
      const c = Array.from(
        document.querySelectorAll<HTMLCanvasElement>(
          `[data-testid="${tid}"] canvas`,
        ),
      ).find((x) => x.width > 0 && x.height > 0);
      if (!c) throw new Error("no sized page canvas");
      const w = window as unknown as Record<string, unknown>;
      const snaps = (w.__snaps ??= {}) as Record<string, ImageData>;
      snaps[n] = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    },
    { tid: PAGE_TESTID, n: name },
  );
}

// Pixels whose channels differ by more than 40 between two snaps, in `box`.
// `lighter` counts only pixels that got lighter, i.e. scan ink erased.
async function diff(
  page: Page,
  a: string,
  b: string,
  box?: Box,
  lighter = false,
) {
  return page.evaluate(
    ({ a, b, box, lighter }) => {
      const s = (window as unknown as { __snaps: Record<string, ImageData> })
        .__snaps;
      const A = s[a];
      const B = s[b];
      if (A.width !== B.width || A.height !== B.height) return -1;
      const r = box ?? { x0: 0, x1: A.width - 1, y0: 0, y1: A.height - 1 };
      let n = 0;
      for (let y = Math.max(0, r.y0); y <= Math.min(A.height - 1, r.y1); y++) {
        for (let x = Math.max(0, r.x0); x <= Math.min(A.width - 1, r.x1); x++) {
          const i = (y * A.width + x) * 4;
          if (lighter) {
            if (B.data[i] - A.data[i] > 40) n++;
            continue;
          }
          if (
            Math.abs(A.data[i] - B.data[i]) > 40 ||
            Math.abs(A.data[i + 1] - B.data[i + 1]) > 40 ||
            Math.abs(A.data[i + 2] - B.data[i + 2]) > 40
          )
            n++;
        }
      }
      return n;
    },
    { a, b, box, lighter },
  );
}

// Rightmost inked pixel inside `box` of a snap, or -1. Paper sits near 236.
async function inkRight(page: Page, name: string, box: Box): Promise<number> {
  return page.evaluate(
    ({ name, box }) => {
      const img = (window as unknown as { __snaps: Record<string, ImageData> })
        .__snaps[name];
      let right = -1;
      for (let y = box.y0; y <= box.y1; y++) {
        for (let x = box.x0; x <= box.x1; x++) {
          const i = (y * img.width + x) * 4;
          if (img.data[i] < 180 && x > right) right = x;
        }
      }
      return right;
    },
    { name, box },
  );
}

// A cheap hash of the page bitmap; "" until the canvas has painted.
async function bitmapSig(page: Page): Promise<string> {
  return page.evaluate((tid) => {
    const c = Array.from(
      document.querySelectorAll<HTMLCanvasElement>(
        `[data-testid="${tid}"] canvas`,
      ),
    ).find((x) => x.width > 0 && x.height > 0);
    if (!c) return "";
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let k = 0; k < d.length; k += 16) h = (h * 31 + d[k]) | 0;
    return `${c.width}x${c.height}:${h}`;
  }, PAGE_TESTID);
}

// Wait until the bitmap differs from `from` (when given), then holds still.
async function settle(page: Page, from?: string): Promise<void> {
  let prev = "";
  await expect
    .poll(
      async () => {
        const sig = await bitmapSig(page);
        const stable = !!sig && sig !== from && sig === prev;
        prev = sig;
        return stable;
      },
      {
        message: "page bitmap never settled",
        timeout: 30_000,
        intervals: [400],
      },
    )
    .toBe(true);
}

async function runs(page: Page): Promise<RunState[]> {
  return page.evaluate(() => {
    const s = (
      window as unknown as {
        __editor_store: { state: { pages: { runs: RunState[] }[] } };
      }
    ).__editor_store;
    // Empty while a reload swaps the document in.
    return (s.state.pages[0]?.runs ?? []).map((r) => ({
      id: r.id,
      text: r.text,
      renderMode: r.renderMode ?? 0,
    }));
  });
}

async function open(page: Page, file: string | Buffer): Promise<void> {
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(
      typeof file === "string"
        ? FIX(file)
        : { name: "reopened.pdf", mimeType: "application/pdf", buffer: file },
    );
  await expect(page.getByTestId(PAGE_TESTID)).toBeVisible({ timeout: 60_000 });
  await waitForEditorReady(page, 60_000);
  await settle(page);
}

// The target line's band on the canvas, from its DOM overlay box.
async function lineBox(page: Page, runId: string): Promise<Box> {
  return page.evaluate(
    ({ tid, id }) => {
      const c = Array.from(
        document.querySelectorAll<HTMLCanvasElement>(
          `[data-testid="${tid}"] canvas`,
        ),
      ).find((x) => x.width > 0 && x.height > 0)!;
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${id}"]`,
      )!;
      const cr = c.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const k = c.width / cr.width;
      return {
        x0: Math.round((er.left - cr.left) * k),
        x1: Math.round(c.width * 0.9),
        y0: Math.round((er.top - cr.top) * k),
        y1: Math.round((er.bottom - cr.bottom + cr.height) * k),
      };
    },
    { tid: PAGE_TESTID, id: runId },
  );
}

async function replaceRunText(page: Page, runId: string, text: string) {
  const from = await bitmapSig(page);
  await page.evaluate(
    ({ id, t }) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${id}"]`,
      )!;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, t);
      el.blur();
    },
    { id: runId, t: text },
  );
  await settle(page, from);
}

for (const fixture of ["scanned-ocr-hocr.pdf", "scanned-ocr-sandwich.pdf"]) {
  test.describe(`PDF text editor - scanned OCR page (${fixture})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
        timeout: 30_000,
      });
      await open(page, fixture);
    });

    test("an edit replaces the scanned words on screen, and undo puts them back", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const target = (await runs(page)).find((r) =>
        r.text.startsWith("Customer: Jane Example"),
      );
      expect(target, "OCR layer has no customer line").toBeTruthy();
      expect(target!.renderMode, "fixture OCR text is not invisible").toBe(3);
      const band = await lineBox(page, target!.id);
      await snap(page, "loaded");

      await replaceRunText(page, target!.id, "Customer: Sam Taylor");
      await snap(page, "edited");

      const edited = (await runs(page)).find((r) => r.id === target!.id)!;
      expect(edited.text).toBe("Customer: Sam Taylor");
      // "Customer:" is unchanged, so it must still be the scan's own pixels.
      const kept = { ...band, x1: band.x0 + 80 };
      expect(
        await diff(page, "loaded", "edited", kept),
        "an unchanged word was redrawn",
      ).toBe(0);
      expect(
        await diff(page, "loaded", "edited", band),
        "the edit did not change the line on screen",
      ).toBeGreaterThan(200);
      // "Sam Taylor" is shorter than "Jane Example": scan ink past the new
      // text's end means the old words still show through.
      const oldRight = await inkRight(page, "loaded", band);
      const newRight = await inkRight(page, "edited", band);
      expect(
        newRight,
        `edited line still reaches x=${newRight} (scan ended at ${oldRight})`,
      ).toBeLessThan(oldRight - 10);
      const outside = { ...band, y0: band.y1 + 4, y1: band.y1 + 400 };
      expect(
        await diff(page, "loaded", "edited", outside),
        "the edit disturbed the lines below it",
      ).toBe(0);

      const editedSig = await bitmapSig(page);
      await page.getByTestId("pdf-editor-undo").click();
      await settle(page, editedSig);
      await snap(page, "undone");
      const undone = (await runs(page)).find((r) => r.id === target!.id)!;
      expect(undone.text).toBe("Customer: Jane Example");
      expect(undone.renderMode, "undo left the OCR text visible").toBe(3);
      expect(
        await diff(page, "loaded", "undone"),
        "undo did not restore the scanned page",
      ).toBeLessThan(20);
    });

    test("typing into scanned OCR text keeps the scan covered and survives a save", async ({
      page,
    }) => {
      test.setTimeout(150_000);
      const target = (await runs(page)).find((r) =>
        r.text.startsWith("Amount due"),
      )!;
      const band = await lineBox(page, target.id);
      await snap(page, "loaded");

      // Keystrokes coalesce into several commands; only the first sees Tr 3.
      const loadedSig = await bitmapSig(page);
      await page.getByTestId(`pdf-editor-run-${target.id}`).click();
      await page.keyboard.press("End");
      await page.keyboard.type(" PAID", { delay: 60 });
      await page.evaluate((id) => {
        document
          .querySelector<HTMLElement>(`[data-testid="pdf-editor-run-${id}"]`)
          ?.blur();
      }, target.id);
      await settle(page, loadedSig);
      await snap(page, "edited");
      const edited = (await runs(page)).find((r) => r.id === target.id)!;
      expect(edited.text).toMatch(/EUR PAID$/);
      expect(
        await inkRight(page, "edited", band),
        "the typed word never became visible",
      ).toBeGreaterThan((await inkRight(page, "loaded", band)) + 20);

      const download = await saveAndDownload(page, false);
      const bytes = await downloadBytes(download);
      await stashCurrentDocument(page);
      await open(page, bytes);
      await waitForReopenedPage(page, 0, 60_000);
      await settle(page);
      await snap(page, "reopened");
      expect(
        await diff(page, "edited", "reopened"),
        "the saved file does not look like the edited page",
      ).toBeLessThan(400);
      const reopened = (await runs(page)).find((r) => r.text.includes("PAID"));
      expect(reopened, "saved file lost the edited text").toBeTruthy();
    });
  });
}

// Tight 11/13pt leading: the cover must span both OCR lines of the block yet
// stop short of the next block's ascenders.
test("a word edit in a scanned OCR paragraph covers the block and spares the next line", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await open(page, "scanned-ocr-paragraph.pdf");
  const all = await runs(page);
  const block = all.find((r) => r.text.includes("fourteen"));
  const next = all.find((r) => r.text.startsWith("date. Payment"));
  expect(block && next, "OCR grouping changed").toBeTruthy();
  const band = await lineBox(page, block!.id);
  // The DOM boxes overlap by a few rows that hold this block's descenders.
  const nextBand = { ...(await lineBox(page, next!.id)), y0: band.y1 + 1 };
  await snap(page, "loaded");

  await replaceRunText(
    page,
    block!.id,
    block!.text.replace("fourteen", "twenty-one"),
  );
  await snap(page, "edited");

  const edited = (await runs(page)).find((r) => r.id === block!.id)!;
  expect(edited.text).toContain("twenty-one");
  // The block's first line is untouched and keeps its scanned pixels.
  const firstLine = {
    ...band,
    y1: band.y0 + Math.round((band.y1 - band.y0) * 0.35),
  };
  expect(
    await diff(page, "loaded", "edited", firstLine),
    "the unchanged first line was redrawn",
  ).toBe(0);
  expect(
    await diff(page, "loaded", "edited", band),
    "the block did not change on screen",
  ).toBeGreaterThan(500);
  // New descenders may dip into the next box; erased scan ink may not.
  expect(
    await diff(page, "loaded", "edited", nextBand, true),
    "the cover erased part of the next OCR line",
  ).toBe(0);
});

// A page-space box (top-down points) on the page canvas, in canvas pixels.
async function ptBox(
  page: Page,
  pageSize: { w: number; h: number },
  x0: number,
  top: number,
  x1: number,
  bottom: number,
): Promise<Box> {
  return page.evaluate(
    ({ tid, pageSize, b }) => {
      const c = Array.from(
        document.querySelectorAll<HTMLCanvasElement>(
          `[data-testid="${tid}"] canvas`,
        ),
      ).find((x) => x.width > 0 && x.height > 0)!;
      const kx = c.width / pageSize.w;
      const ky = c.height / pageSize.h;
      return {
        x0: Math.round(b.x0 * kx),
        x1: Math.round(b.x1 * kx),
        y0: Math.round(b.top * ky),
        y1: Math.round(b.bottom * ky),
      };
    },
    { tid: PAGE_TESTID, pageSize, b: { x0, top, x1, bottom } },
  );
}

// A low-res typewritten form whose reference sits in a tight box (OCR reads
// the box's left edge as "[") and whose label sits just under a rule. The
// replacement must come out in a typewriter face, and no border may fade.
test("a typewritten value in a tight box is redrawn in Courier and the box survives", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await open(page, "scanned-ocr-typewriter-form.pdf");
  const all = await runs(page);
  const ref = all.find((r) => r.text.includes("EXAMPLE2026"));
  const label = all.find((r) => /^Del.vered/.test(r.text));
  expect(ref && label, "OCR grouping changed").toBeTruthy();
  await snap(page, "loaded");

  await replaceRunText(
    page,
    ref!.id,
    ref!.text.replace("EXAMPLE2026000123", "EXAMPLE2026000999"),
  );
  await replaceRunText(page, label!.id, label!.text.replace(/^\S+/, "Sent"));
  await snap(page, "edited");

  const look = await page.evaluate((id) => {
    const run = (
      window as unknown as {
        __editor_store: {
          document: {
            page(i: number): {
              runs: {
                id: string;
                scanEdit: {
                  block: { style: { family: string } } | null;
                  classes: { style: { family: string } }[];
                  inks: Map<string, { dropLead: boolean } | null>;
                };
              }[];
            };
          };
        };
      }
    ).__editor_store.document
      .page(0)
      .runs.find((r) => r.id === id);
    const inks = [...(run?.scanEdit.inks.values() ?? [])];
    return {
      // The "REF" label shares the OCR line, so the value gets its own style.
      family: (run?.scanEdit.classes.at(-1) ?? run?.scanEdit.block)?.style
        .family,
      dropLead: inks.some((i) => i?.dropLead),
    };
  }, ref!.id);
  expect(
    look?.family,
    "typewriter text redrawn in a proportional face",
  ).toMatch(/^Courier/);
  // OCR's "[" is the box edge itself; drawing it would double the border.
  expect(look?.dropLead, "the box edge was redrawn as a bracket").toBe(true);

  // Box: 400..560 x 39..54pt, 1pt stroke. Rule: y 108.2pt from x 45 to 330.
  const size = { w: 595, h: 200 };
  const strips = {
    "box top": await ptBox(page, size, 402, 38.3, 558, 39.7),
    "box bottom": await ptBox(page, size, 402, 53.3, 558, 54.7),
    "box left": await ptBox(page, size, 399.3, 41, 400.7, 52),
    "box right": await ptBox(page, size, 559.3, 41, 560.7, 52),
    rule: await ptBox(page, size, 47, 107.6, 200, 108.8),
  };
  for (const [name, strip] of Object.entries(strips)) {
    // The label's letter tops merge into the rule's blur, so covering the
    // letters must lighten those few pixels; box edges touch no glyph.
    const allowed = name === "rule" ? (strip.x1 - strip.x0) * 0.03 : 0;
    expect(
      await diff(page, "loaded", "edited", strip, true),
      `the ${name} faded under a cover`,
    ).toBeLessThanOrEqual(allowed);
  }
  const inside = await ptBox(page, size, 403, 41, 557, 52);
  expect(
    await diff(page, "loaded", "edited", inside),
    "the reference did not change on screen",
  ).toBeGreaterThan(50);
});

async function openForm(page: Page) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await open(page, "scanned-ocr-typewriter-form.pdf");
}

// Put the caret right after `needle` inside a run's editable box.
async function caretAfter(page: Page, runId: string, needle: string) {
  await page.evaluate(
    ({ id, needle }) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${id}"]`,
      )!;
      el.focus();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = (n.nodeValue ?? "").indexOf(needle);
        if (i < 0) continue;
        const r = document.createRange();
        r.setStart(n, i + needle.length);
        r.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(r);
        return;
      }
      throw new Error(`"${needle}" not in run ${id}`);
    },
    { id: runId, needle },
  );
}

const FORM = { w: 595, h: 200 };

// Enter in a scanned line pushes the rest of the block down a row, the way a
// user expects from any text box; Backspace joins it back to the scan itself.
test("Enter in a scanned block moves later text down a line, Backspace rejoins it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openForm(page);
  const addr = (await runs(page)).find((r) => r.text.startsWith("12-4"))!;
  await snap(page, "loaded");

  const loadedSig = await bitmapSig(page);
  await caretAfter(page, addr.id, "ROAD,");
  await page.keyboard.press("Enter");
  await settle(page, loadedSig);
  await snap(page, "split");
  const split = (await runs(page)).find((r) => r.id === addr.id)!;
  expect(split.text.split("\n")).toHaveLength(3);
  // "EASTPORT" left the first line, and the TEL line now sits a row lower.
  expect(
    await diff(
      page,
      "loaded",
      "split",
      await ptBox(page, FORM, 182, 63, 222, 70),
      true,
    ),
    "EASTPORT still shows on the first line",
  ).toBeGreaterThan(30);
  expect(
    await diff(
      page,
      "loaded",
      "split",
      await ptBox(page, FORM, 40, 87, 160, 95),
    ),
    "nothing was pushed down into the next row",
  ).toBeGreaterThan(50);

  const splitSig = await bitmapSig(page);
  await page.keyboard.press("Backspace");
  await settle(page, splitSig);
  await snap(page, "joined");
  expect((await runs(page)).find((r) => r.id === addr.id)!.text).toBe(
    addr.text,
  );
  expect(
    await diff(page, "loaded", "joined"),
    "rejoining did not bring back the original scan",
  ).toBeLessThan(20);
});

// The words are pixels: deleting the run must hide them, and undo restore them.
test("deleting a scanned line hides it, and undo brings the scan back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openForm(page);
  const all = await runs(page);
  const north = all.find((r) => r.text.startsWith("NORTH"))!;
  await snap(page, "loaded");

  await page.evaluate(
    (rid) =>
      (
        window as unknown as {
          __editor_store: { selection: { selectOne(id: string): void } };
        }
      ).__editor_store.selection.selectOne(rid),
    north.id,
  );
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  const loadedSig = await bitmapSig(page);
  await page.keyboard.press("Delete");
  await settle(page, loadedSig);
  await snap(page, "deleted");
  expect(await runs(page)).toHaveLength(all.length - 1);
  expect(
    await diff(
      page,
      "loaded",
      "deleted",
      await ptBox(page, FORM, 40, 51, 170, 59),
      true,
    ),
    "the deleted line still shows on the scan",
  ).toBeGreaterThan(200);

  const deletedSig = await bitmapSig(page);
  await page.getByTestId("pdf-editor-undo").click();
  await settle(page, deletedSig);
  await snap(page, "undone");
  expect(await runs(page)).toHaveLength(all.length);
  expect(await diff(page, "loaded", "undone")).toBeLessThan(20);
});

// Dragging a scanned block's frame: the scan is covered where it was and the
// text is drawn where it was dropped.
test("dragging a scanned block moves its text off the scan", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openForm(page);
  const north = (await runs(page)).find((r) => r.text.startsWith("NORTH"))!;
  await snap(page, "loaded");
  const box = (await page
    .getByTestId(`pdf-editor-run-${north.id}`)
    .boundingBox())!;
  const loadedSig = await bitmapSig(page);
  await page.mouse.move(box.x + box.width / 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + 2, { steps: 8 });
  await page.mouse.up();
  await settle(page, loadedSig);
  await snap(page, "moved");
  const before = await ptBox(page, FORM, 40, 51, 160, 59);
  expect(
    await diff(page, "loaded", "moved", before, true),
    "the scanned line still shows where it was",
  ).toBeGreaterThan(200);
  expect(
    await inkRight(page, "moved", { ...before, x1: before.x1 + 400 }),
    "the line was not drawn where it was dropped",
  ).toBeGreaterThan(await inkRight(page, "loaded", before));
});

// A scan nobody OCR'd has no text to edit; say so and offer the fix.
test("a scan without OCR runs OCR in one click and reloads editable text", async ({
  page,
}) => {
  const ocrPdf = await readFile(FIX("scanned-ocr-hocr.pdf"));
  let requests = 0;
  await page.route("**/api/v1/ui-data/ocr-pdf", (route) =>
    route.fulfill({ json: { languages: ["eng", "osd"] } }),
  );
  await page.route("**/api/v1/misc/ocr-pdf", async (route) => {
    requests++;
    const body = route.request().postDataBuffer()!.toString("latin1");
    expect(body).toContain('name="fileInput"');
    expect(body).toContain('name="languages"\r\n\r\neng');
    expect(body).toContain('name="ocrType"\r\n\r\nskip-text');
    expect(body).toContain('name="ocrRenderType"\r\n\r\nhocr');
    await route.fulfill({ contentType: "application/pdf", body: ocrPdf });
  });
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await open(page, "scanned-no-ocr.pdf");
  await expect(page.getByTestId("pdf-editor-scan-hint")).toBeVisible();
  await expect(page.getByTestId("pdf-editor-scan-hint-ocr")).toBeEnabled();
  await page.getByTestId("pdf-editor-root").screenshot({
    path: test.info().outputPath("ocr-sidebar.png"),
  });
  await page.screenshot({ path: test.info().outputPath("ocr-editor.png") });
  await page.getByTestId("pdf-editor-scan-hint-ocr").click();
  await expect
    .poll(
      async () => (await runs(page)).filter((r) => r.renderMode === 3).length,
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByTestId("pdf-editor-scan-hint")).toBeHidden();
  await expect(page).toHaveURL(/\/pdf-text-editor/);
  expect(requests).toBe(1);
  const run = (await runs(page)).find((r) => r.text.includes("Jane Example"))!;
  expect(run).toBeDefined();
  await replaceRunText(
    page,
    run.id,
    run.text.replace("Jane Example", "Alex Example"),
  );
  expect((await runs(page)).some((r) => r.text.includes("Alex Example"))).toBe(
    true,
  );
});

// A shorter word must not leave a hole: the scanned words after it slide left
// as the scan's own pixels, so the line ends earlier by about the difference.
test("a shorter word pulls the rest of the scanned line left", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openForm(page);
  const south = (await runs(page)).find((r) => r.text.startsWith("SOUTH"))!;
  const band = await lineBox(page, south.id);
  await snap(page, "loaded");
  await replaceRunText(page, south.id, south.text.replace("SOUTH", "EAST"));
  await snap(page, "edited");
  const before = await inkRight(page, "loaded", band);
  const after = await inkRight(page, "edited", band);
  // One 9pt Courier cell is 5.4pt; allow for blur and rounding.
  const cell = (await ptBox(page, FORM, 0, 0, 5.4, 1)).x1;
  expect(before - after, `line end moved ${before - after}px`).toBeGreaterThan(
    cell * 0.6,
  );
  expect(before - after).toBeLessThan(cell * 1.6);
});

async function blockSoftness(page: Page, runId: string): Promise<number> {
  return page.evaluate((id) => {
    const run = (
      window as unknown as {
        __editor_store: {
          document: {
            page(i: number): {
              runs: {
                id: string;
                scanEdit: { block: { style: { softness: number } } | null };
              }[];
            };
          };
        };
      }
    ).__editor_store.document
      .page(0)
      .runs.find((r) => r.id === id);
    return run?.scanEdit.block?.style.softness ?? -1;
  }, runId);
}

// Edits on a sharp 600dpi scan stay crisp vector text; on a 96dpi scan they
// are softened to match, or they would stand out as the only sharp words.
test("only blurry scans get softened edits", async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await open(page, "scanned-ocr-clean600.pdf");
  const body = (await runs(page)).find((r) => r.text.includes("twelve"))!;
  await replaceRunText(page, body.id, body.text.replace("twelve", "fourteen"));
  expect(await blockSoftness(page, body.id)).toBe(0);

  await openForm(page);
  const south = (await runs(page)).find((r) => r.text.startsWith("SOUTH"))!;
  await replaceRunText(page, south.id, south.text.replace("SOUTH", "EAST"));
  expect(await blockSoftness(page, south.id)).toBeGreaterThan(0);
});
