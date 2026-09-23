import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// A caret parked at the overlay CONTAINER's end (rather than inside the last
// painted line block) makes Firefox insert typed text as a bare sibling of the
// line div. innerText then joins the two as separate blocks, so the model gains
// a line break the user never typed - which pushes the run down the
// multi-object re-emit path and re-emits it as a paragraph.
const USER_SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/user-sample.pdf",
);

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);

async function openEditor(page: import("@playwright/test").Page, file: string) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
}

function modelTextOf(page: import("@playwright/test").Page, testId: string) {
  return page.evaluate((id) => {
    const w = window as unknown as {
      __editor_store: {
        state: { pages: { runs: { id: string; text: string }[] }[] };
      };
    };
    for (const p of w.__editor_store.state.pages) {
      for (const r of p.runs)
        if (`pdf-editor-run-${r.id}` === id) return r.text;
    }
    return "";
  }, testId);
}

test.describe("PDF text editor - caret drift must not invent line breaks", () => {
  test("typing at a container-level caret appends to the line, not a new one", async ({
    page,
  }) => {
    await openEditor(page, USER_SAMPLE_PDF);
    const run = page
      .locator('[data-testid^="pdf-editor-run-p0-"]')
      .filter({ hasText: /^10M\+$/ })
      .first();
    if ((await run.count()) === 0) {
      test.skip(true, "fixture is missing the 10M+ run");
      return;
    }
    const tid = (await run.getAttribute("data-testid")) ?? "";

    // Park the caret at the CONTAINER's end - the position that used to drift.
    for (const ch of ["A", "B"]) {
      await page.evaluate(
        ({ tid, ch }) => {
          const el = document.querySelector<HTMLDivElement>(
            `[data-testid="${tid}"]`,
          );
          if (!el) throw new Error("run missing");
          el.focus();
          const sel = window.getSelection();
          if (!sel) throw new Error("no selection api");
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("insertText", false, ch);
        },
        { tid, ch },
      );
      await page.waitForTimeout(120);
    }

    const text = await modelTextOf(page, tid);
    expect(text, "typed chars must land on the same line").toBe("10M+AB");
    expect(text).not.toContain("\n");
  });

  test("keyboard focus puts the caret inside the last line block", async ({
    page,
  }) => {
    await openEditor(page, SAMPLE_PDF);
    const run = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
    const tid = (await run.getAttribute("data-testid")) ?? "";
    const before = await modelTextOf(page, tid);

    // Focus WITHOUT a pointer, which is the path that positions the caret.
    await page.evaluate((id) => {
      document.querySelector<HTMLDivElement>(`[data-testid="${id}"]`)?.focus();
    }, tid);
    await page.waitForTimeout(120);

    const anchorInsideBlock = await page.evaluate((id) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${id}"]`,
      );
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return false;
      const node = sel.anchorNode;
      if (!node) return false;
      // The caret must sit in a text node, not on the container itself.
      return node !== el && el.contains(node);
    }, tid);
    expect(
      anchorInsideBlock,
      "caret should be inside the painted line, not on the container",
    ).toBe(true);

    // Wherever the caret lands, typing must keep the run on ONE line and lose
    // nothing: a container-level caret used to split the run in two.
    await page.keyboard.insertText("QQ");
    await page.waitForTimeout(150);
    const after = await modelTextOf(page, tid);
    expect(after).not.toContain("\n");
    expect(after.replace("QQ", "")).toBe(before);
    expect(after).toContain("QQ");
  });
});
