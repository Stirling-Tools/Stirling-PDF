/**
 * Environment-identity capture records for ui-walkthrough manifests.
 *
 * Web views keep their `light`/`dark` image fields; every capture — web or
 * native — additionally lands in `captures[]` with the runtime, platform,
 * theme, backend/native mock status and outcome that produced the pixels.
 * Extra keys are ignored by `scripts/report.py validate`, so manifests with
 * `captures[]` still build with the existing report builder. A capture that
 * could not run is recorded with `status: "blocked"` (or `"missing"`) and a
 * reason — never replaced with a proxy from another runtime.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type RuntimeId = "web" | "tauri";
export type CaptureStatus = "captured" | "missing" | "blocked";

export interface CaptureRecord {
  scenarioId: string;
  runtime: RuntimeId;
  platform: string;
  execution?: string;
  theme: "light" | "dark";
  direction?: "ltr" | "rtl";
  backendMode: "real" | "stubbed";
  nativeMode: "real" | "mocked" | "na";
  status: CaptureStatus;
  image?: string;
  reason?: string;
}

export interface ViewEntry {
  id: string;
  title: string;
  platform: string;
  runner: string;
  viewport?: string;
  notes?: string[];
  light?: string;
  dark?: string;
  captures: CaptureRecord[];
}

export interface WalkthroughManifest {
  feature: string;
  branch: string;
  generated: string;
  views: ViewEntry[];
  findings: Record<string, unknown[]>;
  coverage: { expected: string[]; captured: string[] };
}

/** Node platform mapped to the walkthrough matrix ids (`darwin` → `macos`). */
export function hostPlatformId(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return "linux";
}

export function emptyManifest(
  feature: string,
  branch: string,
): WalkthroughManifest {
  return {
    feature,
    branch,
    generated: new Date().toISOString(),
    views: [],
    findings: {
      visual: [],
      ux: [],
      behavior: [],
      a11y: [],
      perf: [],
      native: [],
    },
    coverage: { expected: [], captured: [] },
  };
}

/** Insert or replace a view by id, keeping manifest order stable. */
export function upsertView(
  manifest: WalkthroughManifest,
  view: ViewEntry,
): void {
  const at = manifest.views.findIndex((v) => v.id === view.id);
  if (at >= 0) manifest.views[at] = view;
  else manifest.views.push(view);
}

/** Mark a matrix id captured once at least one record for it is captured. */
export function markCaptured(
  manifest: WalkthroughManifest,
  platformId: string,
): void {
  if (!manifest.coverage.captured.includes(platformId)) {
    manifest.coverage.captured.push(platformId);
  }
}

export function writeManifest(
  outPath: string,
  manifest: WalkthroughManifest,
): void {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
}
