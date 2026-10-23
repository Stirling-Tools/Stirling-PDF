import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Locator, Page } from "@playwright/test";
import path from "path";

const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

async function openRun(page: Page): Promise<Locator> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 45_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(FIXTURE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  const run = page
    .locator('[data-testid^="pdf-editor-run-p0-"]')
    .filter({ hasText: /First line of the body/ })
    .first();
  await run.click();
  const testId = (await run.getAttribute("data-testid")) ?? "";
  await expect
    .poll(() =>
      page.evaluate(
        (id) => document.activeElement?.getAttribute("data-testid") === id,
        testId,
      ),
    )
    .toBe(true);
  return page.locator(`[data-testid="${testId}"]`);
}

function modelText(page: Page, testId: string): Promise<string> {
  return page.evaluate((id) => {
    const store = (
      window as unknown as {
        __editor_store?: {
          doc: {
            page(i: number): { runs: Array<{ id: string; text: string }> };
          };
        };
      }
    ).__editor_store;
    return (
      store?.doc.page(0).runs.find((r) => `pdf-editor-run-${r.id}` === id)
        ?.text ?? ""
    );
  }, testId);
}

function caretInLine(
  page: Page,
  testId: string,
  lineIndex: number,
  offset: number,
) {
  return page.evaluate(
    ({ id, line, off }) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      el.focus();
      const block = el.querySelectorAll<HTMLElement>("[data-pdf-editor-line]")[
        line
      ];
      if (!block) throw new Error(`visual line ${line} is missing`);
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      let seen = 0;
      let node = walker.nextNode();
      while (node) {
        const length = (node.nodeValue ?? "").length;
        if (seen + length >= off) {
          const range = document.createRange();
          range.setStart(node, off - seen);
          range.collapse(true);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          return;
        }
        seen += length;
        node = walker.nextNode();
      }
      throw new Error(`offset ${off} is past visual line ${line}`);
    },
    { id: testId, line: lineIndex, off: offset },
  );
}

function selectAcrossLines(
  page: Page,
  testId: string,
  startModelOffset: number,
  endModelOffset: number,
) {
  return page.evaluate(
    ({ id, from, to }) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      el.focus();
      const blocks = Array.from(
        el.querySelectorAll<HTMLElement>("[data-pdf-editor-line]"),
      );
      const locate = (modelOffset: number) => {
        let remaining = modelOffset;
        let block = blocks[blocks.length - 1];
        for (const candidate of blocks) {
          const length = (candidate.textContent ?? "").length;
          if (remaining <= length) {
            block = candidate;
            break;
          }
          remaining -= length + 1;
        }
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        let seen = 0;
        let node = walker.nextNode();
        while (node) {
          const length = (node.nodeValue ?? "").length;
          if (seen + length >= remaining) {
            return { node, offset: remaining - seen };
          }
          seen += length;
          node = walker.nextNode();
        }
        return {
          node: block,
          offset: block.childNodes.length,
        };
      };
      const start = locate(from);
      const end = locate(to);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { id: testId, from: startModelOffset, to: endModelOffset },
  );
}

function testIdOf(run: Locator): Promise<string> {
  return run.getAttribute("data-testid").then((id) => id ?? "");
}

test.describe("PDF text editor - deleting across painted lines", () => {
  test("Delete removes exactly the selected range across a line break", async ({
    page,
  }) => {
    const run = await openRun(page);
    const testId = await testIdOf(run);
    const before = await modelText(page, testId);
    const lines = before.split("\n");
    const start = lines[0].length - 5;
    const end = lines[0].length + 1 + 5;

    await selectAcrossLines(page, testId, start, end);
    await page.keyboard.press("Delete");

    const expected = before.slice(0, start) + before.slice(end);
    await expect.poll(() => modelText(page, testId)).toBe(expected);
    expect(expected.split("\n")).toHaveLength(lines.length - 1);
  });

  test("Backspace after the run loses focus does not delete the run", async ({
    page,
  }) => {
    const run = await openRun(page);
    const testId = await testIdOf(run);
    const before = await modelText(page, testId);
    // Toolbar and panel clicks blur the editable while its run stays selected.
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press("Backspace");
    await expect.poll(() => modelText(page, testId)).toBe(before);
    expect(await run.count()).toBe(1);
  });

  test("Backspace at the start of a painted line removes the line break", async ({
    page,
  }) => {
    const run = await openRun(page);
    const testId = await testIdOf(run);
    const before = await modelText(page, testId);
    const lines = before.split("\n");

    await caretInLine(page, testId, 1, 0);
    await page.keyboard.press("Backspace");

    const expected = `${lines[0]}${lines[1]}\n${lines.slice(2).join("\n")}`;
    await expect.poll(() => modelText(page, testId)).toBe(expected);
  });

  test("Delete at the end of a painted line removes the line break", async ({
    page,
  }) => {
    const run = await openRun(page);
    const testId = await testIdOf(run);
    const before = await modelText(page, testId);
    const lines = before.split("\n");

    await caretInLine(page, testId, 0, lines[0].length);
    await page.keyboard.press("Delete");

    const expected = `${lines[0]}${lines[1]}\n${lines.slice(2).join("\n")}`;
    await expect.poll(() => modelText(page, testId)).toBe(expected);
  });
});
