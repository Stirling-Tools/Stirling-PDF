/**
 * Proof scenario: the built desktop app launches, shows its main window,
 * and produces one identified screenshot plus a manifest record.
 *
 * Each step asserts a real condition (`waitUntil`, title match) — no fixed
 * sleeps. Extend with fixture seeding and feature-specific testids (added
 * to product code only when the scenario needs them); the adapter helpers
 * stay runtime-specific so scenarios read the same on every OS.
 */
import { join } from "node:path";
import { strict as assert } from "node:assert";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  captureDesktop,
  ensureNoRunningInstance,
  snapshotWebviewPerf,
  waitForReady,
} from "../adapters/tauri-desktop";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  emptyManifest,
  hostPlatformId,
  markCaptured,
  upsertView,
  writeManifest,
  type CaptureRecord,
} from "../capture-manifest";

const SCENARIO_ID = "app-launch";
const OUT_ROOT =
  process.env.WALKTHROUGH_OUT_DIR ?? join(process.cwd(), "captures");

describe("tauri desktop proof", () => {
  it("launches the built app, shows the main window, and captures it", async () => {
    ensureNoRunningInstance();

    const title = await waitForReady(browser);
    assert.match(
      title,
      /stirling/i,
      `expected a Stirling window, got: ${title}`,
    );

    const shotDir = join(OUT_ROOT, `tauri-${hostPlatformId()}`);
    const record: CaptureRecord = await captureDesktop(browser, {
      scenarioId: SCENARIO_ID,
      outDir: shotDir,
      theme: "light",
    });

    const perf = await snapshotWebviewPerf(browser);

    const manifest = emptyManifest("tauri-desktop-proof", "local");
    manifest.coverage.expected = [
      `tauri-${hostPlatformId()}`,
      "android-tauri",
      "ios-tauri",
    ];
    upsertView(manifest, {
      id: SCENARIO_ID,
      title: "Application launch",
      platform: record.platform,
      runner: "@wdio/tauri-service (embedded provider)",
      captures: [record],
      notes: [
        `window title: ${title}`,
        `domNodes=${perf.domNodes ?? "unavailable"} jsHeapBytes=${perf.jsHeapBytes ?? "unavailable"} longTasks=${perf.longTasks ?? "unavailable"}`,
        ...perf.unavailable.map((gap) => `perf gap: ${gap}`),
      ],
    });
    markCaptured(manifest, record.platform);
    writeManifest(join(OUT_ROOT, "manifest.json"), manifest);
  });
});
