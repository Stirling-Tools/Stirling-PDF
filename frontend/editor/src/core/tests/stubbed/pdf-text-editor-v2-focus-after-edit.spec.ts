import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";
import path from "path";
import type { V2TestWindow } from "@app/tests/stubbed/v2EditorTestTypes";

// Guards focus theft after an edit. A window selection outlives the blur that
// ends an edit, and putting a range back into a contenteditable FOCUSES it, so
// an unconditional caret restore hands the cursor back to a run the user has
// already left - taking their typing with it.
//
// Reading the caret from the selection is still right: replaceChildren
// detaches the node it sits in. Writing it back to an unfocused run is not.

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

// Past the 400ms settle and the 600ms model resync, which are the repaints that
// used to hand the run its focus back.
const PAST_SETTLE_MS = 2000;

async function open(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE);
  await expect(page.getByTestId("v2-page-1")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(900);
}

async function findId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const s = (window as unknown as V2TestWindow).__v2_editor_store;
    const r = s.doc
      .page(1)
      .runs.find((x) => /Stirling\s+PDF\s+is\s+a\s+robust/.test(x.text));
    return r ? r.id : "";
  });
  expect(id, "fixture paragraph not found").not.toBe("");
  return id;
}

async function caretEndInsert(page: Page, id: string, text: string) {
  await page.evaluate(
    ({ id, text }: { id: string; text: string }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${id}"]`,
      )!;
      el.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
    },
    { id, text },
  );
  await page.waitForTimeout(150);
}

/** Click blank page chrome - a real click-away, not a programmatic blur. */
async function clickAway(page: Page) {
  await page.getByTestId("v2-page-1").click({ position: { x: 4, y: 4 } });
}

function focusState(page: Page, id: string) {
  return page.evaluate((rid: string) => {
    const el = document.querySelector(`[data-testid="v2-run-${rid}"]`);
    const sel = window.getSelection();
    return {
      runHasFocus: !!(el && el.contains(document.activeElement)),
      activeTestId: document.activeElement?.getAttribute("data-testid") ?? null,
      // Recorded to show the selection genuinely does survive the click-away,
      // which is what made the unconditional restore look harmless.
      selectionInRun: !!(sel?.focusNode && el && el.contains(sel.focusNode)),
    };
  }, id);
}

function runText(page: Page, id: string): Promise<string> {
  return page.evaluate((rid: string) => {
    const r = (window as unknown as V2TestWindow).__v2_editor_store.doc
      .page(1)
      .runs.find((x) => x.id === rid);
    return r ? (r.text as string) : "(gone)";
  }, id);
}

test.describe("v2 editor - an edited run lets go of focus", () => {
  test("clicking away from an edited run leaves it unfocused", async ({
    page,
  }) => {
    await open(page);
    const id = await findId(page);
    await caretEndInsert(page, id, " UNIQ");
    await clickAway(page);

    // Immediately after the click the focus is correctly gone. The theft only
    // lands on the repaint that follows, so the wait is the whole point.
    expect((await focusState(page, id)).runHasFocus).toBe(false);
    await page.waitForTimeout(PAST_SETTLE_MS);

    const state = await focusState(page, id);
    expect(
      state.selectionInRun,
      "precondition: the caret really does outlive the click-away",
    ).toBe(true);
    expect(
      state.runHasFocus,
      `a run the user clicked away from took the cursor back (active=${state.activeTestId})`,
    ).toBe(false);
  });

  test("typing after clicking away does not land in the run just left", async ({
    page,
  }) => {
    await open(page);
    const id = await findId(page);
    await caretEndInsert(page, id, " UNIQ");
    await clickAway(page);
    await page.waitForTimeout(PAST_SETTLE_MS);

    const before = await runText(page, id);
    await page.keyboard.type("ZZZ", { delay: 40 });
    await page.waitForTimeout(1500);

    expect(
      await runText(page, id),
      "keystrokes went into a paragraph the user had already left",
    ).toBe(before);
  });

  test("a repaint after an edit does not re-seat the caret in a blurred run", async ({
    page,
  }) => {
    await open(page);
    const id = await findId(page);
    await caretEndInsert(page, id, " UNIQ");
    await clickAway(page);
    await page.waitForTimeout(PAST_SETTLE_MS);

    // Force a further repaint the way a model change would.
    await page.evaluate(() =>
      (window as unknown as V2TestWindow).__v2_editor_store.resetAll(),
    );
    await page.waitForTimeout(800);

    expect(
      (await focusState(page, id)).runHasFocus,
      "a model-change repaint handed focus back to a blurred run",
    ).toBe(false);
  });
});
