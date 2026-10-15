/**
 * Playwright side of the walkthrough manifest: maps the PNGs the stubbed
 * web specs already produce (`NN_<view>_<theme>.png`) to environment
 * records. Runs under plain node — no browser, no Playwright import — so
 * the same file works from a WDIO run or a report-assembly script.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { CaptureRecord } from "../capture-manifest";

const SHOT_RE = /^(\d+_.+)_(light|dark)\.png$/;

export interface PlaywrightMapOptions {
  areaDir: string;
  runtime?: "web";
  platform?: string;
  backendMode?: "real" | "stubbed";
}

/**
 * One record per `NN_<view>_<theme>.png` found in `areaDir`; views without
 * a file for a theme get a `missing` record so the viewer renders a gap.
 */
export function playwrightCaptures(
  options: PlaywrightMapOptions,
): CaptureRecord[] {
  const {
    areaDir,
    platform = "desktop-web",
    backendMode = "stubbed",
  } = options;
  if (!existsSync(areaDir)) return [];
  const found = new Map<string, Set<string>>();
  for (const file of readdirSync(areaDir)) {
    const match = SHOT_RE.exec(file);
    if (!match) continue;
    const [, view, theme] = match;
    let themes = found.get(view);
    if (!themes) {
      themes = new Set<string>();
      found.set(view, themes);
    }
    themes.add(theme);
  }
  const records: CaptureRecord[] = [];
  for (const [view, themes] of found) {
    for (const theme of ["light", "dark"] as const) {
      const image = join(areaDir, `${view}_${theme}.png`);
      records.push({
        scenarioId: view,
        runtime: "web",
        platform,
        execution: "chromium",
        theme,
        backendMode,
        nativeMode: "na",
        status: themes.has(theme) && existsSync(image) ? "captured" : "missing",
        image: themes.has(theme) ? image : undefined,
        reason: themes.has(theme)
          ? undefined
          : `no ${theme} screenshot for ${view}`,
      });
    }
  }
  return records;
}
