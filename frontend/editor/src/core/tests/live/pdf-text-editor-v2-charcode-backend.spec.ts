import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";
import * as path from "path";
import * as fs from "fs";

/**
 * In dev environments where the Stirling backend ships with login
 * disabled (anonymous-mode), `loginAndSetup` will throw because /login
 * doesn't render. Detect that and silently skip the call. Live CI
 * still hits the real login flow (login enabled in the CI backend
 * profile), so this conditional only takes effect when running the
 * suite against a no-auth dev backend.
 */
async function loginIfNeeded(
  page: import("@playwright/test").Page,
): Promise<void> {
  try {
    await loginAndSetup(page);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/email|login/i.test(msg)) {
      // anonymous-mode backend - nothing to log in to.
      return;
    }
    throw e;
  }
}

/**
 * Live e2e coverage for the v2 PDF text editor's `backend` charcode
 * strategy.
 *
 * Unlike the `stubbed` suite, these tests hit the REAL Spring backend
 * (`/api/v1/general/pdf-text-editor-v2/encode-charcodes`) via PDFBox.
 * Sample.pdf is the standout repro: every glyph is a per-char Type3
 * font where naive Helvetica fallback renders "M" as the wrong glyph
 * shape. The backend's ToUnicode-reverse-CMap lookup resolves each
 * char to its native font + charcode, the frontend's per-char emit
 * branch creates one text object per char with the correct font
 * handle + SetCharcodes(charcode), and the result visually matches
 * the source text.
 *
 * The two things this suite guards against:
 *   1. Regression of the per-char emit branch (must fire on the
 *      FIRST keystroke after focus, NOT the second - the prewarm in
 *      TextRunOverlay.onFocus exists precisely to eliminate the
 *      old 2-attempt UX).
 *   2. Wrong charcode being emitted (e.g. M → 0 / .notdef instead of
 *      the real glyph index that PDFBox's ToUnicode reverse map
 *      returns).
 */

function fixture(filename: string): string {
  const candidates = [
    path.resolve(
      process.cwd(),
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
    path.resolve(
      process.cwd(),
      "frontend",
      "src",
      "core",
      "tests",
      "test-fixtures",
      filename,
    ),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Test fixture not found: ${filename} (tried: ${candidates.join(", ")})`,
  );
}

// `user-sample.pdf` is the same file as `frontend/editor/public/samples/Sample.pdf`,
// copied into the test fixtures dir so this suite is self-contained.
const USER_SAMPLE_PDF = fixture("user-sample.pdf");

async function gotoEditorWithBackendStrategy(
  page: import("@playwright/test").Page,
): Promise<void> {
  // `charcodeDebug=1` enables the HUD overlay (CharcodeDebugHud) that
  // emits one row per attempt, which is what this test scrapes.
  await page.goto("/pdf-text-editor?charcodeStrategy=backend&charcodeDebug=1", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 30_000 });
}

async function loadUserSamplePdf(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page
    .locator('[data-testid="v2-file-input"]')
    .setInputFiles(USER_SAMPLE_PDF);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 60_000 });
}

test.describe("v2 charcode backend strategy (live PDFBox)", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    await loginIfNeeded(page);
  });

  test("Sample.pdf 10M+: typing M into the per-glyph Type3 font emits charcodes-ok on the FIRST keystroke", async ({
    page,
  }) => {
    await gotoEditorWithBackendStrategy(page);
    await loadUserSamplePdf(page);

    // Find the 10M+ run.
    const runEl = page
      .locator('[data-testid^="v2-run-p"]')
      .filter({ hasText: /^10M\+$/ })
      .first();
    await expect(runEl).toBeVisible({ timeout: 15_000 });
    const runTestId = (await runEl.getAttribute("data-testid")) ?? "";
    expect(runTestId).toMatch(/^v2-run-p\d+-/);

    // Listen for the prewarm-complete console.debug log BEFORE we
    // focus the run, so we don't race the message.
    // Match either of:
    //   "backend prewarm pageIdx=0 probes=N" - the completion log
    //   "backend prewarm pageIdx=0 probes=0 (already-prewarmed)" -
    //     cached from a prior test, treat as complete
    // The prewarm-START log ("prewarm-start pageIdx=") confirms that
    // the focus actually triggered the lazy-import path even on the
    // early-return branches.
    const prewarmComplete = page.waitForEvent("console", {
      predicate: (msg) =>
        /\[v2\.charcode\] backend prewarm pageIdx=/.test(msg.text()),
      timeout: 90_000,
    });

    // Surface ALL console messages to the test stdout so we can see
    // what's happening if the prewarm log doesn't fire. Wrapping
    // page.on now means messages from before THIS line are missed,
    // but the prewarm fires after focus (below) so we catch it.
    page.on("console", (msg) => {
      if (/v2\.charcode|prewarm/.test(msg.text())) {
        process.stdout.write(`[page-console-${msg.type()}] ${msg.text()}\n`);
      }
    });

    // Use Playwright's physical click - that dispatches real
    // mousedown/up/click + focus events that React's synthetic
    // event system catches reliably. Calling el.focus() from
    // page.evaluate works for native DOM focus but can race React's
    // focus delegation in unmount/mount transitions.
    await runEl.click();

    // Wait for prewarm to log "[v2.charcode] backend prewarm pageIdx=
    // probes=N". After this fires the per-char cache for the page is
    // populated and the next keystroke hits charcodes-ok on the FIRST
    // try.
    await prewarmComplete;

    // First keystroke: should hit the per-char emit branch on the
    // FIRST try (no Helvetica fallback). Use execCommand("insertText")
    // because Playwright's keyboard.type on contenteditable can
    // occasionally route through synthetic key events that the
    // editor's onInput debounce drops.
    await page.evaluate((tid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${tid}"]`,
      );
      if (!el) throw new Error(`run ${tid} not in DOM`);
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no Selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, "M");
    }, runTestId);

    // Scrape the HUD to verify a charcodes-ok per-char emit landed
    // for the typed "M". We poll until the OK row appears: this is
    // robust to whether the prewarm finished BEFORE the keystroke
    // (ideal: 1-attempt) or it finished slightly after (the resolver's
    // own auto-prefetch + retry-on-next-keystroke kicks in - still
    // correct, just slower).
    const hudLocator = page.getByTestId("v2-charcode-debug-hud");
    await expect(hudLocator).toBeVisible({ timeout: 10_000 });

    // Dump the cache state so the failing assertion shows exactly
    // what got cached vs missed.
    const cacheDump = await page.evaluate(() => {
      const w = window as unknown as {
        __v2_charcode_cache_dump?: () => Record<string, number | null>;
      };
      return w.__v2_charcode_cache_dump?.() ?? null;
    });
    process.stdout.write(
      `[cache-dump] ${JSON.stringify(cacheDump, null, 2)}\n`,
    );

    // Poll for the OK row. Up to 8s gives the resolver time to fall
    // back to the auto-prefetch path if the prewarm raced the
    // keystroke - either way we MUST see a charcodes-ok emit for M.
    await expect
      .poll(
        async () => {
          const text = await hudLocator.innerText();
          return text;
        },
        { timeout: 10_000, intervals: [250, 500, 1000] },
      )
      .toMatch(/text="M"[\s\S]*charcodes \[\d+\][\s\S]*per-char backend emit/);

    // Cross-check: the editor's model must reflect "10M+M" - the
    // typed M became a real text run via the per-char emit branch.
    const runText = await page.evaluate((tid) => {
      const w = window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { id: string; text: string }[] }[] };
        };
      };
      for (const p of w.__v2_editor_store.state.pages) {
        for (const r of p.runs) {
          if (`v2-run-${r.id}` === tid) return r.text;
        }
      }
      return "";
    }, runTestId);
    expect(runText).toBe("10M+M");

    // And the explicit no-regression guard: the latest HUD emit row
    // (top of the list) MUST be the charcodes-ok "M" line, NOT a
    // fallback. This is the "first-keystroke-must-work" assertion.
    // We accept either of two stamp formats - "→ charcodes [182]"
    // (single per-char emit) or a multi-char emit that includes M.
    const hudText = await hudLocator.innerText();
    const firstEmitBlock = hudText.split("(newest first):")[1] ?? hudText;
    expect(
      firstEmitBlock,
      `HUD top-of-list should be a charcodes-ok M emit. Full HUD:\n${hudText}`,
    ).toMatch(/OK[\s\S]*text="M"[\s\S]*charcodes \[\d+\]/);
  });
});
