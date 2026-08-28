import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";

// Undo must return the PAGE BITMAP to its pre-edit ink, not just the model text.
//
// A burst of typing coalesces into ONE undo step, so a single Ctrl+Z reverts
// several EditTextCommands in a row. Each one rebuilt the whole run from its own
// pre-edit snapshot and cleared paragraphLineSlots, so the next revert in the
// chain re-emitted everything again while the previous revert's objects stayed
// on the page. Typing four characters and undoing once took page 0 from 5 text
// objects to 15 to 48, and the original and edited glyphs were painted on top of
// each other while run.text read as correctly restored.
//
// Measured on paragraph-sample.pdf, dark pixels over the run's band:
//   caret mid-token   base 7550 -> edited 7821 -> undone 10298 (+2748) BEFORE
//                                              -> undone  7552 (+2)    AFTER
//   caret end-token   base 7550 -> edited 7825 -> undone 10296 (+2746) BEFORE
//                                              -> undone  7552 (+2)    AFTER
// Caret at the start of a token was always clean, which is why the model-level
// undo tests never caught this.
const FIX = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

async function open(page: Page) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(FIX);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2000);
}

function inkOf(page: Page, testId: string, runId: string) {
  return page.evaluate(
    ({ id, rid }: { id: string; rid: string }) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
      if (!el) return null;
      const canvas = el
        .closest("[data-testid^='v2-page-']")
        ?.querySelector("canvas") as HTMLCanvasElement | null;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return null;
      const cb = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const sx = canvas.width / cb.width;
      const sy = canvas.height / cb.height;
      const x = Math.max(0, Math.floor((r.left - cb.left) * sx) - 10);
      const y = Math.max(0, Math.floor((r.top - cb.top) * sy) - 10);
      const w = Math.min(canvas.width - x, Math.ceil(r.width * sx) + 60);
      const h = Math.min(canvas.height - y, Math.ceil(r.height * sy) + 20);
      const d = ctx.getImageData(x, y, w, h).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 160 && d[i + 1] < 160) dark++;
      }
      const s = (
        window as unknown as {
          __v2_editor_store: {
            state: { pages: { runs: { id: string; text: string }[] }[] };
          };
        }
      ).__v2_editor_store;
      let text: string | null = null;
      for (const p of s.state.pages) {
        const rr = p.runs.find((z) => z.id === rid);
        if (rr) text = rr.text;
      }
      return { dark, text };
    },
    { id: testId, rid: runId },
  );
}

for (const where of ["mid", "start", "end"] as const) {
  test(`undo ink accounting - caret ${where}`, async ({ page }) => {
    test.setTimeout(180_000);
    await open(page);
    const run = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /First line of the body/ })
      .first();
    const testId = (await run.getAttribute("data-testid")) ?? "";
    const runId = testId.replace("v2-run-", "");
    const box = page.locator(`[data-testid="${testId}"]`);

    const base = await inkOf(page, testId, runId);
    expect(base, "no canvas ink reading").not.toBeNull();

    await box.click();
    await page.waitForTimeout(500);
    await page.evaluate(
      ({ id, w }: { id: string; w: string }) => {
        const el = document.querySelector<HTMLElement>(
          `[data-testid="${id}"]`,
        )!;
        el.focus();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode()!;
        const len = (node.nodeValue ?? "").length;
        const off = w === "end" ? len : w === "start" ? 0 : Math.floor(len / 2);
        const sel = window.getSelection()!;
        const r = document.createRange();
        r.setStart(node, off);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      },
      { id: testId, w: where },
    );
    await page.waitForTimeout(300);
    await page.keyboard.type("ZZZZ", { delay: 60 });
    await page.waitForTimeout(1200);
    await page.evaluate((id: string) => {
      document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.blur();
    }, testId);
    await page.waitForTimeout(2500);
    const edited = await inkOf(page, testId, runId);
    expect(edited!.text, "the edit did not land").toContain("ZZZZ");

    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(3000);
    const undone = await inkOf(page, testId, runId);

    // eslint-disable-next-line no-console
    console.log(
      `INKREPORT ${where}: base=${base!.dark} edited=${edited!.dark} undone=${undone!.dark} delta=${undone!.dark - base!.dark} textRestored=${undone!.text === base!.text}`,
    );

    expect(
      Math.abs(undone!.dark - base!.dark),
      `undo left ${undone!.dark - base!.dark}px of ink vs base (base=${base!.dark}, edited=${edited!.dark})`,
    ).toBeLessThan(base!.dark * 0.02);
  });
}
