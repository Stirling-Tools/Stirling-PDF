import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

// Typometer harness for keystroke-to-visual-update latency in the PDF text
// editor. Backend-free: charcode prewarm is stubbed at /api/* like every
// other stubbed spec, so the numbers below isolate the client input path
// (contentEditable input -> overlay refit -> store dispatch -> React paint).
//
// Metrics, all measured in-page with performance.now (zero CDP overhead):
//   L1 keydown->paint:  insertText -> two rAF (paint) elapsed.
//   L2 keydown->caret:  insertText -> overlay text ends with the typed prefix.
//   L3 keydown->settle: insertText -> 100ms with no DOM mutations (capped).
// Distributions use p50/p95 over the measured burst; warmup chars are typed
// first and discarded so vite-dev transform and cold canvas state do not
// pollute the numbers. Longtasks observed during the burst give main-thread
// blocking evidence; a CDP timeline trace around the burst splits CPU time
// into scripting/layout/paint. Network counts cover /api/* during typing.

const FIXTURES = {
  small: "paragraph-sample.pdf",
  large: "big-sample.pdf",
  forms: "form-fields-sample.pdf",
  annotated: "annotation-text-sample.pdf",
  manyPages: "multi-page-sample.pdf",
  tagged: "stirling-marketing.pdf",
} as const;

const WARMUP = 3;
const BURST = 12;
const CHARS = "abcdefghijkl";

interface BurstSample {
  l1: number;
  l2: number;
  l3: number;
}

interface BurstResult {
  samples: BurstSample[];
  longtaskCount: number;
  longtaskTotalMs: number;
  /** ms after each keystroke when post-input DOM mutations fired. */
  mutationTimeline: number[][];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)];
}

async function openEditor(
  page: import("@playwright/test").Page,
  file: string,
): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(file);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
}

async function typeRapidBurst(
  page: import("@playwright/test").Page,
  tid: string,
  chars: string,
): Promise<{ l1: number[] }> {
  return page.evaluate(
    async ({ tid, chars }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${tid}"]`,
      );
      if (!el) throw new Error("run overlay missing");
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      const twoFrames = (): Promise<void> =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      const l1: number[] = [];
      for (const ch of chars) {
        const t0 = performance.now();
        document.execCommand("insertText", false, ch);
        await twoFrames();
        l1.push(performance.now() - t0);
      }
      return { l1 };
    },
    { tid, chars },
  );
}

async function firstRunTestId(
  page: import("@playwright/test").Page,
): Promise<string> {
  const run = page.locator('[data-testid^="pdf-editor-run-p0-"]').first();
  await expect(run).toBeVisible({ timeout: 30_000 });
  return (await run.getAttribute("data-testid")) ?? "";
}

async function typeBurst(
  page: import("@playwright/test").Page,
  tid: string,
): Promise<BurstResult> {
  return page.evaluate(
    async ({ tid, warmup, burst, chars }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${tid}"]`,
      );
      if (!el) throw new Error("run overlay missing");
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      const longtaskDurations: number[] = [];
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longtaskDurations.push(e.duration);
      });
      try {
        po.observe({ entryTypes: ["longtask"] });
      } catch {
        /* longtask unsupported - counts stay zero */
      }
      let mutations = 0;
      const mutationTimes: number[] = [];
      const mo = new MutationObserver(() => {
        mutations += 1;
        mutationTimes.push(performance.now());
      });
      mo.observe(el, { childList: true, characterData: true, subtree: true });

      const twoFrames = (): Promise<void> =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
      const sleep = (ms: number): Promise<void> =>
        new Promise((r) => setTimeout(r, ms));
      const textOf = (): string => el.textContent ?? "";

      for (let i = 0; i < warmup; i += 1) {
        document.execCommand("insertText", false, "z");
        await twoFrames();
      }
      const base = textOf();
      const samples: BurstSample[] = [];
      const mutationTimeline: number[][] = [];
      for (let i = 0; i < burst; i += 1) {
        const want = base + chars.slice(0, i + 1);
        const t0 = performance.now();
        mutationTimes.length = 0;
        document.execCommand("insertText", false, chars[i]);
        await twoFrames();
        const tPaint = performance.now();
        let tCaret = tPaint;
        for (let f = 0; f < 20; f += 1) {
          if (textOf().endsWith(chars.slice(0, i + 1))) {
            tCaret = performance.now();
            break;
          }
          await twoFrames();
        }
        const seen = mutations;
        let tSettle = performance.now();
        for (let waited = 0; waited < 2000; waited += 25) {
          await sleep(25);
          if (mutations === seen && performance.now() - tCaret >= 100) {
            tSettle = performance.now();
            break;
          }
          tSettle = performance.now();
        }
        void want;
        samples.push({ l1: tPaint - t0, l2: tCaret - t0, l3: tSettle - t0 });
        mutationTimeline.push(mutationTimes.map((t) => t - t0));
      }
      po.disconnect();
      mo.disconnect();
      return {
        samples,
        longtaskCount: longtaskDurations.length,
        longtaskTotalMs: longtaskDurations.reduce((a, b) => a + b, 0),
        mutationTimeline,
      };
    },
    { tid, warmup: WARMUP, burst: BURST, chars: CHARS },
  );
}

interface FlameSlice {
  scriptingMs: number;
  layoutMs: number;
  paintMs: number;
  otherMs: number;
  events: number;
  /** Top timeline slices by total time: "Category.Name" -> {ms, count}. */
  topSlices: { name: string; ms: number; count: number }[];
  unavailable?: string;
}

async function captureFlame(
  page: import("@playwright/test").Page,
  fn: () => Promise<unknown>,
): Promise<FlameSlice> {
  const empty: FlameSlice = {
    scriptingMs: 0,
    layoutMs: 0,
    paintMs: 0,
    otherMs: 0,
    events: 0,
    topSlices: [],
  };
  let session: import("@playwright/test").CDPSession | null = null;
  try {
    session = await page.context().newCDPSession(page);
    await session.send("Tracing.start", {
      transferMode: "ReturnAsStream",
      traceConfig: {
        includedCategories: ["devtools.timeline", "blink.user_timing"],
      },
    });
  } catch {
    return { ...empty, unavailable: "tracing-start-failed" };
  }
  let endFailed = false;
  try {
    await fn();
  } finally {
    try {
      await session.send("Tracing.end");
    } catch {
      endFailed = true;
    }
  }
  if (endFailed) return { ...empty, unavailable: "tracing-end-failed" };
  try {
    const { stream } = (await new Promise((resolve) => {
      session.on("Tracing.tracingComplete", resolve);
    })) as unknown as { stream: string };
    let json = "";
    let eof = false;
    while (!eof) {
      const { data, eof: done } = await session.send("IO.read", {
        handle: stream,
        size: 1_048_576,
      });
      json += data;
      eof = done;
    }
    const trace = JSON.parse(json) as {
      traceEvents: { name: string; cat?: string; dur?: number; ph?: string }[];
    };
    const layout = new Set(["Layout", "UpdateLayoutTree", "UpdateLayerTree"]);
    const paint = new Set(["Paint", "CompositeLayers", "DrawFrame"]);
    const scripting = new Set([
      "EvaluateScript",
      "FireAnimationFrame",
      "FunctionCall",
      "EventDispatch",
    ]);
    const out: FlameSlice = { ...empty, topSlices: [] };
    const byName = new Map<string, { ms: number; count: number }>();
    for (const e of trace.traceEvents) {
      if (e.ph !== "X" || typeof e.dur !== "number") continue;
      const ms = e.dur / 1000;
      out.events += 1;
      if (layout.has(e.name)) out.layoutMs += ms;
      else if (paint.has(e.name)) out.paintMs += ms;
      else if (scripting.has(e.name)) out.scriptingMs += ms;
      else out.otherMs += ms;
      const key = `${e.cat ?? "?"}:${e.name}`;
      const agg = byName.get(key) ?? { ms: 0, count: 0 };
      agg.ms += ms;
      agg.count += 1;
      byName.set(key, agg);
    }
    out.topSlices = [...byName.entries()]
      .map(([name, v]) => ({ name, ms: v.ms, count: v.count }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 8);
    return out;
  } catch {
    return { ...empty, unavailable: "trace-parse-failed" };
  }
}

test.describe("PDF text editor - typing latency (Typometer)", () => {
  // Timing budgets under a shared machine: a contended first attempt gets one
  // retry, so the guard catches real regressions without flagging neighbours.
  test.describe.configure({ retries: 1 });
  for (const [scenario, fixture] of Object.entries(FIXTURES)) {
    test(`L1/L2/L3 over a 12-key burst: ${scenario}`, async ({ page }) => {
      test.setTimeout(180_000);
      const file = path.join(
        import.meta.dirname,
        `../test-fixtures/${fixture}`,
      );
      const apiCalls: { bytes: number; at: number; path: string }[] = [];
      const suiteT0 = Date.now();
      page.on("request", (req) => {
        if (req.url().includes("/api/")) {
          apiCalls.push({
            bytes: req.postDataBuffer()?.length ?? 0,
            at: Date.now() - suiteT0,
            path: new URL(req.url()).pathname,
          });
        }
      });
      // Slow-but-successful charcode backend: 250ms latency like production,
      // so in-flight prefetch overlap is observable. Without this the stubbed
      // bootstrap leaves the endpoint to fail fast and flights never overlap.
      await page.route(
        "**/api/v1/general/pdf-text-editor/encode-charcodes",
        async (route) => {
          await new Promise((r) => setTimeout(r, 250));
          const body = route.request().postDataJSON() as {
            text?: string;
          } | null;
          const n = body?.text ? [...body.text].length : 0;
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              charcodes: Array.from({ length: n }, (_, i) => 65 + (i % 26)),
              missing: [],
            }),
          });
        },
      );
      await openEditor(page, file);
      const tid = await firstRunTestId(page);
      if (!tid) {
        test.skip(true, `${fixture} has no page-0 runs`);
        return;
      }

      let burst: BurstResult;
      const flame = await captureFlame(page, async () => {
        burst = await typeBurst(page, tid);
      });
      const result = burst!;
      const l1 = result.samples.map((s) => s.l1).sort((a, b) => a - b);
      const l2 = result.samples.map((s) => s.l2).sort((a, b) => a - b);
      const l3 = result.samples.map((s) => s.l3).sort((a, b) => a - b);
      const mutCounts = result.mutationTimeline.map((t) => t.length);
      const mutLast = result.mutationTimeline
        .map((t) => (t.length > 0 ? t[t.length - 1] : 0))
        .sort((a, b) => a - b);
      const row = {
        scenario,
        n: result.samples.length,
        l1p50: percentile(l1, 50),
        l1p95: percentile(l1, 95),
        l2p50: percentile(l2, 50),
        l2p95: percentile(l2, 95),
        l3p50: percentile(l3, 50),
        l3p95: percentile(l3, 95),
        longtasks: result.longtaskCount,
        longtaskMs: result.longtaskTotalMs,
        flame,
        mutationTimeline: result.mutationTimeline,
        mutPerKeyP50: percentile(
          [...mutCounts].sort((a, b) => a - b),
          50,
        ),
        mutLastP50: percentile(mutLast, 50),
        apiCalls: apiCalls.length,
        apiBytes: apiCalls.reduce((a, c) => a + c.bytes, 0),
      };
      // Rapid phase: 12 fresh chars at rAF spacing (~fast typist) against the
      // slow stubbed backend. Greek misses both the burst-1 cache and the
      // focus-prewarm alphabet, so cold per-font flights overlap here: a
      // per-keystroke prefetcher fires ~12 POSTs while a coalescing one
      // fires ~1 per font.
      const rapidStart = apiCalls.length;
      const rapidWaitStart = Date.now() - suiteT0;
      const rapid = await typeRapidBurst(page, tid, "αβγδεζηθικλμν");
      await page.waitForTimeout(1500);
      const rapidL1 = [...rapid.l1].sort((a, b) => a - b);
      const rapidCalls = apiCalls.slice(rapidStart);
      const rapidRow = {
        n: rapid.l1.length,
        l1p50: percentile(rapidL1, 50),
        l1p95: percentile(rapidL1, 95),
        apiCalls: rapidCalls.length,
        apiBytes: rapidCalls.reduce((a, c) => a + c.bytes, 0),
        apiAt: rapidCalls.map((c) => c.at - rapidWaitStart),
        outcomes: await page.evaluate(() => {
          const w = window as unknown as {
            __charcode_events?: {
              outcome: string;
              text: string;
              note: string;
            }[];
          };
          const tail = (w.__charcode_events ?? []).slice(-15);
          const counts: Record<string, number> = {};
          for (const e of tail)
            counts[e.outcome] = (counts[e.outcome] ?? 0) + 1;
          return { counts, notes: tail.map((e) => e.note).slice(-5) };
        }),
        modelTail: await page.evaluate((id) => {
          const w = window as unknown as {
            __editor_store?: {
              state: { pages: { runs: { id: string; text: string }[] }[] };
            };
          };
          for (const p of w.__editor_store?.state.pages ?? []) {
            for (const r of p.runs) {
              if (`pdf-editor-run-${r.id}` === id) return r.text.slice(-20);
            }
          }
          return "<run-missing>";
        }, tid),
      };
      console.log(
        `[typometer] ${row.scenario} n=${row.n} ` +
          `L1 p50=${row.l1p50.toFixed(1)}ms p95=${row.l1p95.toFixed(1)}ms ` +
          `L2 p50=${row.l2p50.toFixed(1)}ms p95=${row.l2p95.toFixed(1)}ms ` +
          `L3 p50=${row.l3p50.toFixed(1)}ms p95=${row.l3p95.toFixed(1)}ms ` +
          `longtask=${row.longtasks}x/${row.longtaskMs.toFixed(1)}ms ` +
          `flame=script ${row.flame.scriptingMs.toFixed(1)}/layout ${row.flame.layoutMs.toFixed(1)}/paint ${row.flame.paintMs.toFixed(1)}/other ${row.flame.otherMs.toFixed(1)}ms ` +
          `top=[${row.flame.topSlices.map((s) => `${s.name} ${s.ms.toFixed(0)}msx${s.count}`).join(", ")}] ` +
          `mut=${row.mutPerKeyP50}x/key last@${row.mutLastP50.toFixed(0)}ms ` +
          `api=${row.apiCalls}x/${row.apiBytes}B ` +
          `rapid12 L1 p50=${rapidRow.l1p50.toFixed(1)}ms p95=${rapidRow.l1p95.toFixed(1)}ms ` +
          `rapidApi=${rapidRow.apiCalls}x/${rapidRow.apiBytes}B@${JSON.stringify(rapidRow.apiAt)} ` +
          `rapidModelTail=${JSON.stringify(rapidRow.modelTail)} ` +
          `outcomes=${JSON.stringify(rapidRow.outcomes.counts)} ` +
          `notes=${JSON.stringify(rapidRow.outcomes.notes)} ` +
          `paths=[${[...new Set(apiCalls.map((c) => c.path))].sort().join(", ")}]` +
          (row.flame.unavailable
            ? ` flame-unavailable=${row.flame.unavailable}`
            : ""),
      );
      const fullRow = {
        ...row,
        rapid: rapidRow,
        apiPaths: [...new Set(apiCalls.map((c) => c.path))].sort(),
      };
      await test.info().attach(`typometer-${scenario}.json`, {
        body: JSON.stringify(fullRow, null, 2),
        contentType: "application/json",
      });

      // L3 floors at the 100ms quiet window by definition, so its p95 needs
      // headroom for the machine running six spec files at once; measured
      // p50 is ~115ms and p95 ~125ms when idle, ~250ms under full load.
      expect(row.l1p95, "L1 p95 budget").toBeLessThan(50);
      expect(row.l3p95, "L3 p95 budget").toBeLessThan(400);
      expect(rapidRow.l1p95, "Rapid burst L1 p95 budget").toBeLessThan(80);
      expect(
        rapidRow.apiCalls,
        "rapid-burst prefetch coalescing",
      ).toBeLessThanOrEqual(4);
    });
  }
});
