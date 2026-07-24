import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

/**
 * Letter-spacing (Tc) preservation through an edit.
 *
 * letter-spacing-sample.pdf has an 18pt "SPACED HEADING" drawn with `2 Tc`
 * plus a normal 12pt body line. Editing the heading re-emits it (the modify
 * path bails on whitespace, exactly like the Mangum CV title), and before the
 * fix the re-emit used the font's natural advances - the wide tracking
 * collapsed. The reader now infers each run's effective letter-spacing from
 * its on-page char geometry and the emit re-applies it.
 *
 * The round-trip assertion is the crisp signal: after delete-one-char, save,
 * and reopen, the reloaded heading's inferred `charSpacingPt` must still be
 * ~2pt (the re-emitted per-char objects carry the tracking), while the
 * body line stays at 0 (no spacing invented for normal text).
 */

const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/letter-spacing-sample.pdf",
);

test("editing a letter-spaced heading keeps its tracking through save+reopen", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(120_000);
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  // Serve real charcodes for the standard-14 Helvetica: its charcode IS the
  // ASCII code, so the per-char backend branch engages like production.
  await page.route("**/encode-charcodes", async (route: Route) => {
    let text = "";
    try {
      const body = route.request().postDataJSON() as { text?: string };
      text = body.text ?? "";
    } catch {
      /* fall through with empty text */
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        charcodes: [...text].map((c) => c.codePointAt(0) ?? 0),
        missing: [],
        note: "stub ascii",
      }),
    });
  });

  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(FIXTURE);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);

  const readRuns = () =>
    page.evaluate(() => {
      const s = (window as unknown as V2TestWindow).__v2_editor_store;
      return s.doc.page(0).runs.map((r) => ({
        id: r.id,
        text: r.text,
        charSpacingPt: r.charSpacingPt,
      }));
    });

  const before = await readRuns();
  const heading = before.find((r) => r.text.includes("SPACED"));
  const body = before.find((r) => r.text.includes("Normal"));
  expect(heading, `heading run in ${JSON.stringify(before)}`).toBeTruthy();
  expect(body, "body run found").toBeTruthy();
  // Inference reads ~2pt for the spaced heading, 0 for the normal line.
  expect(heading!.charSpacingPt).toBeGreaterThan(1.4);
  expect(heading!.charSpacingPt).toBeLessThan(2.6);
  expect(body!.charSpacingPt).toBe(0);

  // Focus (prewarm), then delete the "C" of SPACED and commit.
  await page.evaluate((rid: string) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="v2-run-${rid}"]`,
    )!;
    el.focus();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    while (walker.nextNode()) {
      const t = walker.currentNode as Text;
      if (t.data.includes("SPACED")) {
        node = t;
        break;
      }
    }
    if (!node) throw new Error("heading text node not found");
    const idx = node.data.indexOf("C");
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + 1);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("delete");
  }, heading!.id);
  await page.waitForTimeout(300);
  await page.evaluate((rid: string) => {
    document
      .querySelector<HTMLElement>(`[data-testid="v2-run-${rid}"]`)
      ?.blur();
  }, heading!.id);
  await page.waitForTimeout(1500);

  // Save + reopen the produced bytes.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("v2-save").click();
  const dl = await downloadPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  await page.locator('[data-testid="v2-file-input"]').setInputFiles({
    name: "round-trip.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.concat(chunks),
  });
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(800);

  const after = await readRuns();
  const headingAfter = after.find((r) =>
    r.text.replace(/\s/g, "").includes("SPAED"),
  );
  const bodyAfter = after.find((r) => r.text.includes("Normal"));
  expect(
    headingAfter,
    `edited heading present after reopen; runs=${JSON.stringify(after)}`,
  ).toBeTruthy();
  // The re-emitted heading still carries ~2pt tracking (round-trips through
  // the reader's inference on the fresh per-char objects).
  expect(headingAfter!.charSpacingPt).toBeGreaterThan(1.2);
  expect(headingAfter!.charSpacingPt).toBeLessThan(3.0);
  // The untouched body line still reads as unspaced.
  expect(bodyAfter?.charSpacingPt ?? 0).toBe(0);
  expect(errs, `no page errors:\n${errs.join("\n")}`).toEqual([]);
});
