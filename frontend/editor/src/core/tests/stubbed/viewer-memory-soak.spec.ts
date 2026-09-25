/** GC-normalized open/render/delete soak. Catches retained-memory regressions
 *  that a single open cannot: leaked object URLs, growing JS heap, DOM nodes or
 *  listeners that survive document removal.
 *
 *  Chromium-only because the retained-heap reading needs CDP GC; the other
 *  engines skip. Mirrors the loop used during the viewer perf pass; keep the
 *  iteration count small enough for PR CI. Budgets assume the preview build:
 *  the dev server's StrictMode double-mounting inflates listener counts.
 *
 *  SOAK_FIXTURE overrides the cycled document (default: the small annotation
 *  sample). Point it at the form fixture to exercise the field-appearance
 *  overlay caches, which the default fixture never touches (no AcroForm).
 *  PERF_SNAPSHOTS=1 dumps heap snapshots at cycles 5 and N to .perf-local/.
 *  PERF_FINALIZERS=1 registers each cycle's rendered page element in a
 *  FinalizationRegistry and logs collection lag (warn-only: finalizer timing
 *  is not guaranteed, so it is a signal, never an assertion).
 */

import path from "path";
import { writeFile } from "node:fs/promises";
import { test, expect } from "@app/tests/helpers/stub-test-base";

const SAMPLE_PDF =
  process.env.SOAK_FIXTURE ??
  path.join(import.meta.dirname, "../test-fixtures/annotation-text-sample.pdf");
const SNAPSHOT_DIR = path.join(import.meta.dirname, "../../../../.perf-local");
const ITERATIONS = Number(process.env.SOAK_ITERATIONS ?? 12);

type Sample = {
  iter: number;
  phase: "open" | "removed";
  jsHeapMB: number;
  nodes: number;
  listeners: number;
  blobs: number;
  timers: number;
  mainWasmPages: number;
  workerWasmPages: number;
  workers: number;
};

/** Same probe inside the engine workers, installed before the module loads. */
const installWorkerMemoryProbe = () => {
  const w = self as unknown as { __soakWorkerMemories?: WebAssembly.Memory[] };
  if (w.__soakWorkerMemories) return;
  w.__soakWorkerMemories = [];
  const record = (instance: unknown) => {
    try {
      const memory = (instance as WebAssembly.Instance).exports?.memory as
        | WebAssembly.Memory
        | undefined;
      if (memory && !w.__soakWorkerMemories!.includes(memory)) {
        w.__soakWorkerMemories!.push(memory);
      }
    } catch {
      /* ignore */
    }
  };
  const instantiate = WebAssembly.instantiate.bind(WebAssembly);
  WebAssembly.instantiate = ((
    ...args: Parameters<typeof WebAssembly.instantiate>
  ) => {
    const result = instantiate(
      ...(args as [BufferSource, WebAssembly.Imports?]),
    );
    return Promise.resolve(result).then((res) => {
      record(
        (res as WebAssembly.WebAssemblyInstantiatedSource).instance ?? res,
      );
      return res;
    });
  }) as typeof WebAssembly.instantiate;
  const OrigInstance = WebAssembly.Instance as unknown as new (
    m: WebAssembly.Module,
    i?: WebAssembly.Imports,
  ) => WebAssembly.Instance;
  const ProbeInstance = function (
    this: unknown,
    m: WebAssembly.Module,
    i?: WebAssembly.Imports,
  ) {
    const instance = new OrigInstance(m, i);
    record(instance);
    return instance;
  } as unknown as typeof WebAssembly.Instance;
  ProbeInstance.prototype = OrigInstance.prototype;
  WebAssembly.Instance = ProbeInstance;
};

test.describe("viewer memory soak", { tag: "@memory-soak" }, () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "retained-heap readings need CDP",
  );

  test("open/render/delete cycles do not grow retained memory", async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await page.addInitScript((collectFinalizers: boolean) => {
      const w = window as unknown as {
        __soak: {
          created: number;
          revoked: number;
          memories: WeakRef<WebAssembly.Memory>[];
          pendingAsync: Set<object>;
          pendingStacks: Map<object, string>;
          registry: FinalizationRegistry<{ kind: string; size: number }> | null;
          finalizedBlobs: Array<{ kind: string; size: number }>;
        };
      };
      w.__soak = {
        created: 0,
        revoked: 0,
        memories: [],
        pendingAsync: new Set(),
        pendingStacks: new Map(),
        registry: null,
        finalizedBlobs: [],
      };
      if (collectFinalizers) {
        // Lifetime probe for document bytes: a Blob that survives removal and
        // GC shows up as never finalizing (or finalizing much later than its
        // cycle). Finalizer timing is engine-heuristic, so this is a lead,
        // never an assertion.
        w.__soak.registry = new FinalizationRegistry((held) => {
          w.__soak.finalizedBlobs.push(held);
        });
      }
      // Pending-timer census: every schedule mints a token, fire/cancel
      // retires it. Extra callback arguments and RAF timestamps pass
      // through untouched, so app timing semantics do not change.
      const pendingAsync: Set<object> = w.__soak.pendingAsync;
      const pendingStacks: Map<object, string> = w.__soak.pendingStacks;
      const liveTokens = new Map<number, object>();
      const retire = (id: number) => {
        const token = liveTokens.get(id);
        if (token) {
          liveTokens.delete(id);
          pendingAsync.delete(token);
          pendingStacks.delete(token);
        }
      };
      const mintToken = () => {
        const token = {};
        pendingAsync.add(token);
        pendingStacks.set(token, new Error().stack ?? "");
        return token;
      };
      const origSetTimeout = window.setTimeout.bind(window);
      const origClearTimeout = window.clearTimeout.bind(window);
      const origSetInterval = window.setInterval.bind(window);
      const origClearInterval = window.clearInterval.bind(window);
      const origRaf = window.requestAnimationFrame.bind(window);
      const origCancelRaf = window.cancelAnimationFrame.bind(window);
      window.setTimeout = ((
        handler: TimerHandler,
        timeout?: number,
        ...args: unknown[]
      ) => {
        if (typeof handler !== "function") {
          return origSetTimeout(handler, timeout, ...(args as []));
        }
        const token = mintToken();
        const id = origSetTimeout(
          (...inner: unknown[]) => {
            retire(id);
            (handler as (...a: unknown[]) => void)(...inner);
          },
          timeout,
          ...(args as []),
        );
        liveTokens.set(id, token);
        return id;
      }) as typeof window.setTimeout;
      window.clearTimeout = ((id?: number) => {
        if (id !== undefined) retire(id);
        return origClearTimeout(id as number);
      }) as typeof window.clearTimeout;
      window.setInterval = ((
        handler: TimerHandler,
        timeout?: number,
        ...args: unknown[]
      ) => {
        if (typeof handler !== "function") {
          return origSetInterval(handler, timeout, ...(args as []));
        }
        const token = mintToken();
        const id = origSetInterval(
          (...inner: unknown[]) => {
            (handler as (...a: unknown[]) => void)(...inner);
          },
          timeout,
          ...(args as []),
        );
        liveTokens.set(id, token);
        return id;
      }) as typeof window.setInterval;
      window.clearInterval = ((id?: number) => {
        if (id !== undefined) retire(id);
        return origClearInterval(id as number);
      }) as typeof window.clearInterval;
      window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
        const token = mintToken();
        const id = origRaf((time) => {
          retire(id);
          callback(time);
        });
        liveTokens.set(id, token);
        return id;
      }) as typeof window.requestAnimationFrame;
      window.cancelAnimationFrame = ((id: number) => {
        retire(id);
        return origCancelRaf(id);
      }) as typeof window.cancelAnimationFrame;
      const create = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (obj: Blob | MediaSource) => {
        w.__soak.created++;
        // Lifetime probe: every Blob handed to createObjectURL should become
        // collectible once its URL is revoked and the record is removed. Kept
        // behind PERF_FINALIZERS (registration has a runtime cost).
        if (w.__soak.registry && obj instanceof Blob) {
          w.__soak.registry.register(obj, {
            kind: "blob",
            size: obj.size,
          });
        }
        return create(obj);
      };
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url: string) => {
        w.__soak.revoked++;
        return revoke(url);
      };
      // Page-count telemetry: bytes mix in unrelated allocations, pages are the
      // unit wasm memory is actually committed in (64 KiB each). Weak refs, so
      // the probe measures the live instance instead of pinning every module the
      // session ever created (the reclaim path creates one per workbench-empty).
      const record = (instance: unknown) => {
        try {
          const memory = (instance as WebAssembly.Instance).exports?.memory as
            | WebAssembly.Memory
            | undefined;
          if (
            memory &&
            !w.__soak.memories.some((ref) => ref.deref() === memory)
          ) {
            w.__soak.memories.push(new WeakRef(memory));
          }
        } catch {
          /* ignore */
        }
      };
      const instantiate = WebAssembly.instantiate.bind(WebAssembly);
      WebAssembly.instantiate = ((
        ...args: Parameters<typeof WebAssembly.instantiate>
      ) => {
        const result = instantiate(
          ...(args as [BufferSource, WebAssembly.Imports?]),
        );
        return Promise.resolve(result).then((res) => {
          record(
            (res as WebAssembly.WebAssemblyInstantiatedSource).instance ?? res,
          );
          return res;
        });
      }) as typeof WebAssembly.instantiate;
      const OrigInstance = WebAssembly.Instance as unknown as new (
        m: WebAssembly.Module,
        i?: WebAssembly.Imports,
      ) => WebAssembly.Instance;
      const ProbeInstance = function (
        this: unknown,
        m: WebAssembly.Module,
        i?: WebAssembly.Imports,
      ) {
        const instance = new OrigInstance(m, i);
        record(instance);
        return instance;
      } as unknown as typeof WebAssembly.Instance;
      ProbeInstance.prototype = OrigInstance.prototype;
      WebAssembly.Instance = ProbeInstance;
    }, process.env.PERF_FINALIZERS === "1");
    page.on("worker", (worker) => {
      void worker.evaluate(installWorkerMemoryProbe).catch(() => undefined);
    });

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.enable");
    await cdp.send("Runtime.enable");

    const snapshotChunks: string[] = [];
    cdp.on("HeapProfiler.addHeapSnapshotChunk", (params) => {
      snapshotChunks.push(params.chunk as string);
    });
    const dumpHeapSnapshot = async (iter: number) => {
      snapshotChunks.length = 0;
      await cdp.send("HeapProfiler.takeHeapSnapshot", {
        reportProgress: false,
      });
      const file = path.join(
        SNAPSHOT_DIR,
        `soak-snapshot-iter${iter}.heapsnapshot`,
      );
      await writeFile(file, snapshotChunks.join(""));
      snapshotChunks.length = 0;
      console.log(`[MEMORY-SOAK-SNAPSHOT] ${file}`);
    };

    const read = async (
      iter: number,
      phase: Sample["phase"],
    ): Promise<Sample> => {
      await cdp.send("HeapProfiler.collectGarbage");
      const { usedSize } = await cdp.send("Runtime.getHeapUsage");
      const { nodes, jsEventListeners } = await cdp.send(
        "Memory.getDOMCounters",
      );
      const main = await page.evaluate(() => {
        const soak = (
          window as unknown as {
            __soak: {
              created: number;
              revoked: number;
              memories: WeakRef<WebAssembly.Memory>[];
              pendingAsync: Set<object>;
            };
          }
        ).__soak;
        let pages = 0;
        for (const ref of soak.memories) {
          const memory = ref.deref();
          if (!memory) continue;
          try {
            pages += memory.buffer.byteLength / 65536;
          } catch {
            /* detached */
          }
        }
        return {
          blobs: soak.created - soak.revoked,
          mainWasmPages: Math.round(pages),
          timers: soak.pendingAsync.size,
        };
      });
      let workerWasmPages = 0;
      for (const worker of page.workers()) {
        try {
          workerWasmPages += await worker.evaluate(() => {
            const memories =
              (
                self as unknown as {
                  __soakWorkerMemories?: WebAssembly.Memory[];
                }
              ).__soakWorkerMemories ?? [];
            let pages = 0;
            for (const memory of memories) {
              try {
                pages += memory.buffer.byteLength / 65536;
              } catch {
                /* detached */
              }
            }
            return Math.round(pages);
          });
        } catch {
          /* worker may have terminated */
        }
      }
      return {
        iter,
        phase,
        jsHeapMB: +(usedSize / 1024 / 1024).toFixed(2),
        nodes,
        listeners: jsEventListeners,
        blobs: main.blobs,
        timers: main.timers,
        mainWasmPages: main.mainWasmPages,
        workerWasmPages,
        workers: page.workers().length,
      };
    };

    const samples: Sample[] = [];
    await page.goto("/editor", { waitUntil: "domcontentloaded" });

    for (let iter = 1; iter <= ITERATIONS; iter++) {
      await page.getByTestId("files-button").click();
      await page
        .locator('[data-testid="file-input"]')
        .first()
        .setInputFiles(SAMPLE_PDF);
      await expect(page.locator('[data-page-index="0"]').first()).toBeAttached({
        timeout: 120_000,
      });
      await expect(
        page
          .locator(
            '[data-page-index="0"] img[src^="blob:"], [data-page-index="0"] canvas',
          )
          .first(),
      ).toBeAttached({ timeout: 120_000 });
      await page.waitForTimeout(500);
      samples.push(await read(iter, "open"));

      if (process.env.PERF_FINALIZERS) {
        await page.evaluate((cycle) => {
          const w = window as unknown as {
            __fr?: {
              registry: FinalizationRegistry<string>;
              finalized: string[];
            };
          };
          if (!w.__fr) {
            w.__fr = {
              registry: new FinalizationRegistry((held) => {
                w.__fr?.finalized.push(held);
              }),
              finalized: [],
            };
          }
          const el = document.querySelector(
            '[data-page-index="0"] img[src^="blob:"], [data-page-index="0"] canvas',
          );
          if (el) w.__fr.registry.register(el, `cycle-${cycle}-page0`);
        }, iter);
      }

      const row = page.locator(".file-sidebar-file-item").first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      await row.hover();
      await row.locator(".file-sidebar-kebab-btn").click({ timeout: 30_000 });
      await page
        .getByRole("menuitem", { name: "Delete" })
        .click({ timeout: 30_000 });
      const confirm = page
        .getByRole("button", { name: /^(Delete|Confirm|Yes)/i })
        .last();
      if (await confirm.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await confirm.click();
      }
      await page.waitForTimeout(500);
      samples.push(await read(iter, "removed"));

      if (process.env.PERF_FINALIZERS) {
        // Warn-only: finalizer timing is engine-heuristic, so a lagging
        // count is a lead for snapshot diffing, never a failure.
        await page.waitForTimeout(2000);
        const probe = await page.evaluate(() => {
          const fr = (window as unknown as { __fr?: { finalized: string[] } })
            .__fr;
          const soak = (
            window as unknown as {
              __soak: { finalizedBlobs: Array<{ kind: string; size: number }> };
            }
          ).__soak;
          const blobs = soak.finalizedBlobs;
          return {
            elements: fr?.finalized.length ?? 0,
            blobs: blobs.length,
            blobBytes: blobs.reduce((sum, b) => sum + b.size, 0),
          };
        });
        console.log(
          `[MEMORY-SOAK-FINALIZERS] ${JSON.stringify({ iter, ...probe })}`,
        );
      }
      if (process.env.PERF_TIMER_STACKS) {
        const groups = await page.evaluate(() => {
          const { pendingStacks } = (
            window as unknown as {
              __soak: { pendingStacks: Map<object, string> };
            }
          ).__soak;
          const counts: Record<string, number> = {};
          for (const stack of pendingStacks.values()) {
            // Six app frames: the mint site alone cannot tell the four
            // viewer-chunk polls apart (they share one scheduling helper).
            const key = stack
              .split("\n")
              .slice(2, 8)
              .join(" | ")
              .replace(/http:\/\/localhost:\d+/g, "HOST")
              .replace(/:\d+:\d+/g, "");
            counts[key] = (counts[key] ?? 0) + 1;
          }
          return counts;
        });
        console.log(
          `[MEMORY-SOAK-TIMER-GROUPS] ${JSON.stringify({ iter, groups })}`,
        );
      }
      if (process.env.PERF_SNAPSHOTS && (iter === 5 || iter === ITERATIONS)) {
        await dumpHeapSnapshot(iter);
      }
    }

    console.log(`[MEMORY-SOAK] ${JSON.stringify(samples)}`);
    if (process.env.PERF_TIMER_STACKS) {
      const stacks = await page.evaluate(() =>
        Array.from(
          (
            window as unknown as {
              __soak: { pendingStacks: Map<object, string> };
            }
          ).__soak.pendingStacks.values(),
        ).slice(0, 200),
      );
      console.log(`[MEMORY-SOAK-TIMER-STACKS] ${JSON.stringify(stacks)}`);
    }
    for (const phase of ["open", "removed"] as const) {
      const series = samples.filter((s) => s.phase === phase);
      const early = series.filter((s) => s.iter <= 3);
      const late = series.filter((s) => s.iter > ITERATIONS - 3);
      const median = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
      };
      const heapEarly = median(early.map((s) => s.jsHeapMB));
      const heapLate = median(late.map((s) => s.jsHeapMB));
      const blobsEarly = median(early.map((s) => s.blobs));
      const blobsLate = median(late.map((s) => s.blobs));
      const nodesEarly = median(early.map((s) => s.nodes));
      const nodesLate = median(late.map((s) => s.nodes));
      const listenersEarly = median(early.map((s) => s.listeners));
      const listenersLate = median(late.map((s) => s.listeners));
      // Worker pages sawtooth by design: the respawn watcher terminates the
      // engine worker after a departing document and the next open re-grows it,
      // so early medians sit at the fresh floor while late medians sit at the
      // document's high-water. Compare peaks: only a peak that grows across
      // cycles is a ratchet.
      const workerPagesPeakEarly = Math.max(
        ...early.map((s) => s.workerWasmPages),
      );
      const workerPagesPeakLate = Math.max(
        ...late.map((s) => s.workerWasmPages),
      );
      const workersEarly = median(early.map((s) => s.workers));
      const workersLate = median(late.map((s) => s.workers));

      // Object URLs are deterministic: the eviction on file removal must keep
      // the count flat (a small delta covers cache warm-up).
      expect(
        blobsLate - blobsEarly,
        `${phase}: leaked object URLs over ${ITERATIONS} cycles`,
      ).toBeLessThanOrEqual(2);
      // DOM nodes are also deterministic; a growing count means the viewer or
      // sidebar keeps a removed document mounted.
      expect(
        nodesLate - nodesEarly,
        `${phase}: DOM nodes grew over ${ITERATIONS} cycles`,
      ).toBeLessThanOrEqual(50);
      // Event listeners attach per mounted interactive component, so they
      // drift only when a removed document leaves components behind.
      // Measured drift is 0 on both phases over 12 cycles; 10 keeps the
      // sentinel an order below the node bound while tolerating warm-up.
      expect(
        listenersLate - listenersEarly,
        `${phase}: event listeners grew over ${ITERATIONS} cycles`,
      ).toBeLessThanOrEqual(10);
      // Wasm memory only grows within one instance, so a peak that grows
      // across cycles means PDFium caches are not being recycled with the
      // document. The bound tolerates allocator slack between the first and
      // last cycle while catching per-cycle accumulation (measured peak delta
      // is 0 on the form fixture with respawn active).
      expect(
        workerPagesPeakLate - workerPagesPeakEarly,
        `${phase}: worker wasm peak grew over ${ITERATIONS} cycles`,
      ).toBeLessThanOrEqual(64);
      // Worker count is set by the engine/encoder pool at boot; every worker
      // that outlives its document is a permanent floor. Measured drift is 0
      // on both phases over 12 cycles (default and form fixtures), so 0 is
      // the honest bound.
      expect(
        workersLate - workersEarly,
        `${phase}: worker count grew over ${ITERATIONS} cycles`,
      ).toBeLessThanOrEqual(0);
      // Heap is noisier than node counts, so it is a wider sentinel than the
      // 10% manual gate; it still catches a monotonic per-cycle leak.
      expect(
        heapLate / heapEarly,
        `${phase}: retained heap grew over ${ITERATIONS} cycles`,
      ).toBeLessThan(1.25);
    }
  });
});
