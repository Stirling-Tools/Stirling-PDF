import { test, expect } from "@app/tests/helpers/test-base";
import { loginAndSetup } from "@app/tests/helpers/login";
import * as path from "path";
import * as fs from "fs";

// In dev environments where the Stirling backend ships with login disabled
// (anonymous-mode), `loginAndSetup` will throw because /login doesn't render.
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

// Live e2e coverage for the PDF text editor's `backend` charcode strategy.

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
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
}

async function loadUserSamplePdf(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(USER_SAMPLE_PDF);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

test.describe("charcode backend strategy (live PDFBox)", () => {
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
      .locator('[data-testid^="pdf-editor-run-p"]')
      .filter({ hasText: /^10M\+$/ })
      .first();
    await expect(runEl).toBeVisible({ timeout: 15_000 });
    const runTestId = (await runEl.getAttribute("data-testid")) ?? "";
    expect(runTestId).toMatch(/^pdf-editor-run-p\d+-/);

    // Listen for the prewarm-complete console.debug log BEFORE we focus the
    // run, so we don't race the message.
    const prewarmComplete = page.waitForEvent("console", {
      predicate: (msg) =>
        /\[charcode\] backend prewarm pageIdx=/.test(msg.text()),
      timeout: 90_000,
    });

    // Surface ALL console messages to the test stdout so we can see what's
    // happening if the prewarm log doesn't fire.
    page.on("console", (msg) => {
      if (/charcode|prewarm/.test(msg.text())) {
        process.stdout.write(`[page-console-${msg.type()}] ${msg.text()}\n`);
      }
    });

    // Use Playwright's physical click - that dispatches real mousedown/up/click
    // + focus events that React's synthetic event system catches reliably.
    await runEl.click();

    // Wait for prewarm to log "[charcode] backend prewarm pageIdx=
    // probes=N".
    await prewarmComplete;

    // First keystroke: should hit the per-char emit branch on the FIRST try (no
    // Helvetica fallback).
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

    // The debug HUD was removed from production builds, so verify the emit
    // through the window-exposed telemetry buffer instead.
    type CharcodeEmitEvent = {
      text: string;
      outcome: string;
      resolved: number[];
    };
    const readCharcodeEvents = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __charcode_events?: CharcodeEmitEvent[];
            }
          ).__charcode_events ?? [],
      );

    await expect
      .poll(
        async () => {
          const events = await readCharcodeEvents();
          return events.some(
            (e) =>
              e.text.includes("M") &&
              e.outcome === "charcodes-ok" &&
              e.resolved.length > 0,
          );
        },
        { timeout: 10_000, intervals: [250, 500, 1000] },
      )
      .toBe(true);

    // Cross-check: the editor's model must reflect "10M+M" - the
    // typed M became a real text run via the per-char emit branch.
    const runText = await page.evaluate((tid) => {
      const w = window as unknown as {
        __editor_store: {
          state: { pages: { runs: { id: string; text: string }[] }[] };
        };
      };
      for (const p of w.__editor_store.state.pages) {
        for (const r of p.runs) {
          if (`pdf-editor-run-${r.id}` === tid) return r.text;
        }
      }
      return "";
    }, runTestId);
    expect(runText).toBe("10M+M");

    // No-regression guard: the MOST RECENT emit covering "M" must be a
    // source-font charcodes-ok emit, NOT a Helvetica fallback.
    const events = await readCharcodeEvents();
    const mEvents = events.filter((e) => e.text.includes("M"));
    const lastM = mEvents[mEvents.length - 1];
    expect(
      lastM?.outcome,
      `latest M emit must be charcodes-ok. Events:\n${JSON.stringify(events, null, 2)}`,
    ).toBe("charcodes-ok");
  });
});
