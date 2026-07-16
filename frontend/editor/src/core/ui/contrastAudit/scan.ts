// Scans each rendered story's DOM (text colour vs. the colour it overlays) and
// drives Storybook to switch stories in place. The panel calls runScan().

import {
  type Rgb,
  parseColor,
  over,
  contrastRatio,
  hex,
} from "@app/ui/contrastAudit/contrast";

export interface Finding {
  ratio: number;
  floor: number;
  fg: string;
  bg: string;
  text: string;
  tag: string;
  storyId: string;
  storyTitle: string;
  count: number;
}

export interface StoryEntry {
  id: string;
  title: string;
  name: string;
  type: string;
}

export interface Progress {
  done: number;
  total: number;
  current: string;
}

export const LOAD_TIMEOUT_MS = 30000; // cold Storybook boot can be slow
export const MAX_ROWS = 600;
const RENDER_TIMEOUT_MS = 3000; // cap on waiting for a story's render event
const RENDER_GRACE_MS = 150; // let async content + layout settle after render

// Nearest ancestor background the element overlays, compositing translucent
// layers. Null when a gradient/image sits behind the text (can't judge it).
function effectiveBg(el: Element, win: Window): Rgb | null {
  let node: Element | null = el;
  let acc: Rgb | null = null;
  while (node) {
    const cs = win.getComputedStyle(node);
    if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
    const bg = parseColor(cs.backgroundColor);
    if (bg.a > 0) {
      acc = acc ? over(acc, bg) : bg;
      if (acc.a >= 1) return acc;
    }
    node = node.parentElement;
  }
  const bodyCs = win.getComputedStyle(win.document.body);
  if (bodyCs.backgroundImage && bodyCs.backgroundImage !== "none") return null;
  const body = parseColor(bodyCs.backgroundColor);
  const base = body.a >= 1 ? body : { r: 255, g: 255, b: 255, a: 1 };
  return acc ? over(acc, base) : base;
}

function isVisible(el: Element, cs: CSSStyleDeclaration): boolean {
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  if (Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function hasDirectText(el: Element): boolean {
  for (const n of el.childNodes)
    if (n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim())
      return true;
  return false;
}

function scanDoc(
  win: Window,
  story: StoryEntry,
  push: (f: Omit<Finding, "count">) => void,
): void {
  const els = win.document.body.querySelectorAll("*");
  for (const el of els) {
    // svg uses `fill`, not `color`; match by namespace (realm-safe).
    if (el.namespaceURI === "http://www.w3.org/2000/svg") continue;
    if (!hasDirectText(el)) continue;
    const cs = win.getComputedStyle(el);
    if (!isVisible(el, cs)) continue;
    const bg = effectiveBg(el, win);
    if (!bg) continue;
    let fg = parseColor(cs.color);
    if (fg.a < 1) fg = over(fg, bg);
    const ratio = contrastRatio(fg, bg);
    const fs = parseFloat(cs.fontSize) || 16;
    const bold = cs.fontWeight === "bold" || Number(cs.fontWeight) >= 700;
    const large = fs >= 24 || (fs >= 18.66 && bold);
    const floor = large ? 3.0 : 4.5;
    if (ratio >= floor) continue;
    const text = (el.textContent ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 60);
    push({
      ratio,
      floor,
      fg: hex(fg),
      bg: hex(bg),
      text,
      tag: el.tagName.toLowerCase(),
      storyId: story.id,
      storyTitle: story.title,
    });
  }
}

function loadStory(
  iframe: HTMLIFrameElement,
  id: string,
  theme: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const to = window.setTimeout(
      () => reject(new Error("timeout")),
      LOAD_TIMEOUT_MS,
    );
    const onload = () => {
      window.clearTimeout(to);
      iframe.removeEventListener("load", onload);
      resolve();
    };
    iframe.addEventListener("load", onload);
    // URLSearchParams encodes each value; theme clamped to a known token.
    const safeTheme = theme === "dark" ? "dark" : "light";
    const qs = new URLSearchParams({
      id,
      globals: `theme:${safeTheme}`,
      viewMode: "story",
    });
    iframe.src = `iframe.html?${qs.toString()}`;
  });
}

// Preview internals used to switch stories without reloading. onSetCurrentStory
// re-renders locally without broadcasting (so the parent preview isn't
// navigated); the channel is only listened to, never emitted on.
interface SbPreview {
  onSetCurrentStory(o: { storyId: string; viewMode: string }): void;
}
interface SbChannel {
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
}
type SbWindow = Window & {
  __STORYBOOK_PREVIEW__?: SbPreview;
  __STORYBOOK_ADDONS_CHANNEL__?: SbChannel;
};

const RENDER_EVENTS = ["storyRendered", "storyMissing", "storyErrored"];

// Re-assert the selected theme before measuring, in case a story left a
// different scheme on <html> (its theme decorator runs a frame late).
function applyTheme(win: Window, theme: string): void {
  const root = win.document.documentElement;
  root.setAttribute("data-app-theme", "custom");
  root.setAttribute("data-accent", "default");
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-mantine-color-scheme", theme);
}

// The runtime boots asynchronously after the iframe's load event.
function waitForPreview(win: SbWindow, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (win.__STORYBOOK_PREVIEW__) return resolve(true);
      if (performance.now() - start > timeoutMs) return resolve(false);
      window.setTimeout(tick, 50);
    };
    tick();
  });
}

// Switch to `id` and resolve on the render event (or cap) so data-backed
// stories are measured with content, not mid-spinner.
function renderStory(
  preview: SbPreview,
  channel: SbChannel,
  id: string,
): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      for (const ev of RENDER_EVENTS) channel.off(ev, finish);
      window.setTimeout(resolve, RENDER_GRACE_MS);
    };
    for (const ev of RENDER_EVENTS) channel.on(ev, finish);
    try {
      preview.onSetCurrentStory({ storyId: id, viewMode: "story" });
    } catch {
      finish();
      return;
    }
    window.setTimeout(finish, RENDER_TIMEOUT_MS);
  });
}

export interface ScanOptions {
  theme: string;
  oncePerComponent: boolean;
  shouldStop: () => boolean;
  onProgress: (p: Progress) => void;
  onFindings: (findings: Finding[]) => void;
}

export type ScanOutcome = "done" | "stopped" | "failed";

// Fetch the story index, boot the preview once, then scan each story and stream
// deduped findings.
export async function runScan(
  iframe: HTMLIFrameElement,
  opts: ScanOptions,
): Promise<ScanOutcome> {
  let stories: StoryEntry[];
  try {
    const index = (await fetch("index.json").then((r) => r.json())) as {
      entries: Record<string, StoryEntry>;
    };
    stories = Object.values(index.entries).filter((e) => e.type === "story");
  } catch {
    return "failed";
  }
  if (opts.oncePerComponent) {
    const seen = new Set<string>();
    stories = stories.filter((s) =>
      seen.has(s.title) ? false : (seen.add(s.title), true),
    );
  }
  if (stories.length === 0) return "done";
  opts.onProgress({
    done: 0,
    total: stories.length,
    current: "booting preview…",
  });

  // Boot once, then switch stories in place (the reboot is the expensive part).
  try {
    await loadStory(iframe, stories[0].id, opts.theme);
  } catch {
    return "failed";
  }
  const win = iframe.contentWindow as SbWindow | null;
  if (!win || !(await waitForPreview(win))) return "failed";
  const preview = win.__STORYBOOK_PREVIEW__;
  const channel = win.__STORYBOOK_ADDONS_CHANNEL__;
  if (!preview || !channel) return "failed";

  // Dedupe per component + colour pair; count = occurrences.
  const bySig = new Map<string, Finding>();

  for (let i = 0; i < stories.length; i++) {
    if (opts.shouldStop()) return "stopped";
    const story = stories[i];
    opts.onProgress({ done: i, total: stories.length, current: story.title });
    try {
      await renderStory(preview, channel, story.id);
      if (!win.document?.body) continue;
      applyTheme(win, opts.theme);
      scanDoc(win, story, (f) => {
        const sig = `${f.storyTitle}|${f.fg}|${f.bg}`;
        const existing = bySig.get(sig);
        if (existing) existing.count += 1;
        else bySig.set(sig, { ...f, count: 1 });
      });
    } catch {
      // story failed to render — skip
    }
    opts.onFindings(
      [...bySig.values()]
        .sort(
          (a, b) =>
            a.ratio - b.ratio || a.storyTitle.localeCompare(b.storyTitle),
        )
        .slice(0, MAX_ROWS),
    );
  }
  opts.onProgress({ done: stories.length, total: stories.length, current: "" });
  return "done";
}
