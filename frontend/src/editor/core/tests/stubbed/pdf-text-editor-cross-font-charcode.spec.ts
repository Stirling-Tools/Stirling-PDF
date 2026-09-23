import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import path from "path";
import type { EditorTestWindow } from "@app/tests/stubbed/editorTestTypes";

/** Cross-font charcode disambiguation (H1H2/U). */

const SUBSET = path.join(
  import.meta.dirname,
  "../test-fixtures/subset-font-sample.pdf",
);

test("editor sends the run's font name to encode-charcodes", async ({
  page,
}: {
  page: Page;
}) => {
  test.setTimeout(90_000);
  const bodies: Array<Record<string, unknown>> = [];
  await page.route("**/encode-charcodes", async (route: Route) => {
    try {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
    } catch {
      /* ignore non-JSON */
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ charcodes: [65], missing: [], note: "stub" }),
    });
  });

  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 20_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SUBSET);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(800);

  // Edit a run - the cache-miss prefetch (and focus prewarm) POST to the
  // endpoint, now carrying the resolved font's name.
  const id = await page.evaluate(() => {
    const s = (window as unknown as EditorTestWindow).__editor_store;
    return s.doc.page(0).runs[0]?.id ?? null;
  });
  expect(id, "page 0 has a run").toBeTruthy();
  await page.evaluate((rid: string) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="pdf-editor-run-${rid}"]`,
    )!;
    el.focus();
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, "s");
  }, id as string);
  await page.waitForTimeout(1500);

  expect(bodies.length, "endpoint was called").toBeGreaterThan(0);
  const named = bodies.filter(
    (b) => typeof b.fontName === "string" && (b.fontName as string).length > 0,
  );
  expect(
    named.length,
    `at least one request carries a non-empty fontName; bodies=${JSON.stringify(
      bodies.map((b) => b.fontName),
    )}`,
  ).toBeGreaterThan(0);

  // The program-bytes hash must ride along too: PDFium reports every
  // "ABCDEF+Family" subset as bare "Family".
  const hashed = bodies.filter(
    (b) =>
      typeof b.fontSha256 === "string" &&
      /^[0-9a-f]{64}$/.test(b.fontSha256 as string),
  );
  expect(
    hashed.length,
    `at least one request carries a 64-hex fontSha256; bodies=${JSON.stringify(
      bodies.map((b) => b.fontSha256),
    )}`,
  ).toBeGreaterThan(0);
});
