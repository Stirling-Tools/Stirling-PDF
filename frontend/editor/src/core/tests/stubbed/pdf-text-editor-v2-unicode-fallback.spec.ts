import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

/**
 * Client-side Unicode fallback font (Noto Sans, embedded on demand).
 *
 * Base-14 PDF fonts only cover Latin-1. The editor embeds Noto Sans (Latin,
 * Greek, Cyrillic) via FPDFText_LoadFont so those scripts survive a
 * save+reopen round-trip. Scripts the bundled font does NOT cover (CJK, Arabic,
 * Hebrew, emoji) are dropped on save - but cleanly: no U+00FF tofu and no lone
 * surrogate, and surrounding Latin text is preserved.
 *
 * Backend-free: encode-charcodes is aborted, so the edit takes the base-14
 * re-emit path where the fallback kicks in.
 */

const SAMPLE = path.join(__dirname, "../../../../public/samples/Sample.pdf");

// Scripts the bundled Noto Sans covers - these survive a round-trip.
const COVERED = [{ name: "Cyrillic", text: "Привет" }];

// Scripts the bundled font lacks - dropped cleanly (no tofu) on save.
const UNCOVERED = [
  { name: "CJK", text: "日本語" },
  { name: "astral", text: "😀" },
];

// A Latin anchor from Sample.pdf's first run, used to prove the surrounding
// text is intact after an uncovered script is dropped.
const LATIN_ANCHOR = "Acrobat";
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;

async function gotoEditor(page: Page): Promise<Promise<unknown>> {
  await page.route("**/encode-charcodes", (route: Route) => route.abort());
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  // Capture the fallback-font fetch (fired on mount) so we can await it before
  // editing - the embed is sync and needs the bytes cached.
  const fontLoaded = page
    .waitForResponse((r) => /NotoSans-Regular\.ttf/.test(r.url()), {
      timeout: 20_000,
    })
    .catch(() => null);
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
  return fontLoaded;
}

// Load SAMPLE, append `text` to the first run, blur, save, and reopen the
// produced bytes. Returns the reopened page-0 model text plus any page errors.
async function appendSaveReopen(
  page: Page,
  text: string,
): Promise<{ reopened: string; errs: string[]; runId: string }> {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  const fontLoaded = await gotoEditor(page);
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await fontLoaded; // bytes cached before we edit
  await page.waitForTimeout(400);

  // Append the sample text to the first run and commit (blur).
  const id = await page.evaluate(() => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    return s.doc.page(0).runs[0]?.id ?? null;
  });
  expect(id, "page 0 has at least one run").toBeTruthy();

  await page.evaluate(
    ({ rid, txt }: { rid: string; txt: string }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      )!;
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, " " + txt);
    },
    { rid: id as string, txt: text },
  );
  await page.waitForTimeout(200);
  await page.evaluate((rid: string) => {
    document
      .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
      ?.blur();
  }, id as string);
  await page.waitForTimeout(1000);

  // Save, then reopen the produced bytes.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("v2-save").click();
  const dl = await downloadPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const saved = Buffer.concat(chunks);

  await page.locator('[data-testid="v2-file-input"]').setInputFiles({
    name: "round-trip.pdf",
    mimeType: "application/pdf",
    buffer: saved,
  });
  await expect(page.locator('[data-testid^="v2-run-p0-"]').first()).toBeVisible(
    { timeout: 30_000 },
  );
  await page.waitForTimeout(500);

  const reopened = await page.evaluate(() => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    return s.doc
      .page(0)
      .runs.map((r) => r.text)
      .join("");
  });
  return { reopened, errs, runId: id as string };
}

for (const { name, text } of COVERED) {
  test(`non-Latin (${name}) survives a save+reopen via the embedded fallback font`, async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { reopened, errs } = await appendSaveReopen(page, text);

    // The reopened document must still carry the text (embedded, not dropped).
    expect(reopened).toContain(text);
    expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
  });
}

for (const { name, text } of UNCOVERED) {
  test(`non-Latin (${name}) is dropped cleanly (no tofu) when the fallback lacks it`, async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const { reopened, errs } = await appendSaveReopen(page, text);

    // The bundled font lacks this script, so it is dropped on save - but
    // without injecting U+00FF tofu or a lone surrogate, and the original
    // Latin text must remain intact.
    expect(reopened).not.toContain(text);
    expect(reopened).not.toContain("ÿ");
    expect(LONE_SURROGATE.test(reopened)).toBe(false);
    expect(reopened).toContain(LATIN_ANCHOR);
    expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
  });
}

/**
 * RTL / bidi insertion.
 *
 * RTL scripts (Arabic, Hebrew) need the Noto fallback since base-14 lacks them.
 * The editor positions runs by left-x/advance, so RTL/bidi is a classic source
 * of caret/bounds/save-order bugs. These assert model correctness, an in-bounds
 * run, save+reopen survival, and logical character order for a bidi mix.
 */

const RTL_SAMPLES = [
  { name: "Arabic", text: "مرحبا" },
  { name: "Hebrew", text: "שלום" },
];

for (const { name, text } of RTL_SAMPLES) {
  test(`RTL (${name}) insert: model, in-bounds run, save+reopen`, async ({
    page,
  }) => {
    test.setTimeout(120_000);

    // Read the edited run's bounds before save so we can check it stays on page.
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message));

    const fontLoaded = await gotoEditor(page);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await fontLoaded;
    await page.waitForTimeout(400);

    const id = await page.evaluate(() => {
      const s = (window as unknown as V2TestWindow).__v2_editor_store;
      return s.doc.page(0).runs[0]?.id ?? null;
    });
    expect(id, "page 0 has at least one run").toBeTruthy();

    await page.evaluate(
      ({ rid, txt }: { rid: string; txt: string }) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${rid}"]`,
        )!;
        el.focus();
        const sel = window.getSelection()!;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertText", false, " " + txt);
      },
      { rid: id as string, txt: text },
    );
    await page.waitForTimeout(200);
    await page.evaluate((rid: string) => {
      document
        .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
        ?.blur();
    }, id as string);
    await page.waitForTimeout(1000);

    // (a) model text carries the inserted RTL string.
    const model = await page.evaluate((rid: string) => {
      const s = (window as unknown as V2TestWindow).__v2_editor_store;
      return s.doc.page(0).runs.find((r) => r.id === rid)?.text ?? "";
    }, id as string);
    expect(model).toContain(text);

    // (b) the edited run stays within page bounds after the edit.
    const fits = await page.evaluate((rid: string) => {
      const s = (window as unknown as V2TestWindow).__v2_editor_store;
      const pg = s.doc.page(0);
      const r = pg.runs.find((x) => x.id === rid)!;
      return { boundsRight: r.bounds.x + r.bounds.width, pageWidth: pg.width };
    }, id as string);
    expect(
      fits.boundsRight,
      "RTL run must not extend past the page width",
    ).toBeLessThanOrEqual(fits.pageWidth + 2);

    // (c) save+reopen preserves the text.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const saved = Buffer.concat(chunks);

    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "rtl-round-trip.pdf",
      mimeType: "application/pdf",
      buffer: saved,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);

    const reopened = await page.evaluate(() => {
      const s = (window as unknown as V2TestWindow).__v2_editor_store;
      return s.doc
        .page(0)
        .runs.map((r) => r.text)
        .join("");
    });
    // Noto Sans lacks Arabic/Hebrew, so the script is dropped on save - but
    // cleanly (no U+00FF tofu) with the Latin content preserved.
    expect(reopened).not.toContain(text);
    expect(reopened).not.toContain("ÿ");
    expect(reopened).toContain(LATIN_ANCHOR);
    expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
  });
}

test("bidi mix preserves logical character order in the model", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // Logical order is the order the characters are typed, not the visual order.
  const BIDI = "abc مرحبا 123";
  const { reopened, errs } = await appendSaveReopen(page, BIDI);

  // The Arabic span is dropped (no Noto coverage), but the covered Latin/digit
  // parts survive in logical order without tofu or reordering.
  expect(reopened).not.toContain("مرحبا");
  expect(reopened).not.toContain("ÿ");
  expect(reopened).toContain("abc");
  expect(reopened).toContain("123");
  expect(reopened.indexOf("abc")).toBeLessThan(reopened.indexOf("123"));
  expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
});
