// The scanning engine: walks each rendered story's DOM comparing text colour to
// the colour it overlays, and drives Storybook to switch stories in place. No
// React here — the panel calls runScan() and reacts to its callbacks.

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

export const LOAD_TIMEOUT_MS = 30000; // a cold Storybook boot can be slow
export const MAX_ROWS = 600;
// Wait for a story to signal it has rendered before scanning it (capped so a
// story that never signals can't stall the scan), plus a small grace after for
// in-component async (mock fetches) and final layout. A blind fixed delay was
// too short for data-backed stories in a foreground tab (they were scanned mid
// spinner → no findings), and too dependent on background-tab timer throttling.
const RENDER_TIMEOUT_MS = 3000;
const RENDER_GRACE_MS = 150;

// The background colour an element actually overlays: nearest ancestor with a
// non-transparent background, compositing translucent layers as we climb.
// Returns null when a gradient/image sits behind the text — its colour can't be
// determined statically, so the caller skips it rather than guessing (which is
// what produced bogus "white-on-white" hits on gradient buttons/avatars).
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

// Scan one rendered document for text that fails contrast against its own fill.
function scanDoc(
  win: Window,
  story: StoryEntry,
  push: (f: Omit<Finding, "count">) => void,
): void {
  const els = win.document.body.querySelectorAll("*");
  for (const el of els) {
    // svg uses `fill`, not `color`; skip by namespace (realm-safe, and avoids
    // touching win.SVGElement which isn't on the Window type).
    if (el.namespaceURI === "http://www.w3.org/2000/svg") continue;
    if (!hasDirectText(el)) continue;
    const cs = win.getComputedStyle(el);
    if (!isVisible(el, cs)) continue;
    const bg = effectiveBg(el, win);
    if (!bg) continue; // gradient/image backdrop — can't judge statically
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
    // Build the query via URLSearchParams (encodes every value) and clamp the
    // theme to a known token — keeps untrusted-looking input out of the URL.
    const safeTheme = theme === "dark" ? "dark" : "light";
    const qs = new URLSearchParams({
      id,
      globals: `theme:${safeTheme}`,
      viewMode: "story",
    });
    iframe.src = `iframe.html?${qs.toString()}`;
  });
}

// Storybook preview internals we drive to switch stories WITHOUT reloading the
// runtime. Calling onSetCurrentStory directly (vs emitting on the channel)
// re-renders locally and does NOT broadcast, so the audit page (itself a story
// in the parent preview) isn't navigated away mid-scan. We only *listen* on the
// channel (never emit), so it stays a safe read.
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

// Force the selected theme's attributes on the scanned document right before we
// measure. A story can transiently leave a different scheme on <html> (its own
// theme decorator runs in an effect, a frame behind the render), which would
// otherwise resolve token colours to the WRONG theme — e.g. dark --c-text
// (#f4f4f5) measured against a light background — a phantom "invisible text"
// finding. Re-asserting here makes every measurement consistently the chosen
// theme. (setAttribute forces a synchronous style recalc, so reads after it are
// already correct.)
function applyTheme(win: Window, theme: string): void {
  const root = win.document.documentElement;
  root.setAttribute("data-app-theme", "custom");
  root.setAttribute("data-accent", "default");
  root.setAttribute("data-theme", theme);
  root.setAttribute("data-mantine-color-scheme", theme);
}

// After the iframe's load event the Storybook runtime still boots
// asynchronously; poll until the preview global appears.
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

// Switch the already-booted preview to `id` in place and resolve once it has
// actually rendered — we wait for Storybook's storyRendered/Missing/Errored
// event (not a blind timer) so data-backed stories are measured with their
// content, not mid-spinner. A cap prevents a story that never signals from
// stalling the scan; a short grace after lets in-component async + layout land.
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

// Orchestrates a full pass: fetch the story index, boot the preview once, then
// switch through every story, scanning each and streaming deduped findings.
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
  // Feedback during the (potentially slow, cold) first boot so it doesn't look
  // frozen at 0/N.
  opts.onProgress({
    done: 0,
    total: stories.length,
    current: "booting preview…",
  });

  // Boot the preview runtime ONCE, then switch stories in place. The reboot
  // (providers, MSW, i18n) is the expensive part; doing it per story is what
  // made each one take seconds. Failure-safe: a boot error resolves to "failed"
  // (idle) rather than rejecting and hanging the scan on "scanning" forever.
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

  // Dedupe per COMPONENT + colour pair: the same #fg-on-#bg inside one component
  // collapses to a single row (count = occurrences), while a different colour
  // pair, or the same pair in another component, stays distinct. Text is not
  // part of the key (it just samples the first hit).
  const bySig = new Map<string, Finding>();

  for (let i = 0; i < stories.length; i++) {
    if (opts.shouldStop()) return "stopped";
    const story = stories[i];
    opts.onProgress({ done: i, total: stories.length, current: story.title });
    try {
      await renderStory(preview, channel, story.id);
      if (!win.document?.body) continue;
      applyTheme(win, opts.theme); // consistent theme at measurement time

      scanDoc(win, story, (f) => {
        const sig = `${f.storyTitle}|${f.fg}|${f.bg}`;
        const existing = bySig.get(sig);
        if (existing) existing.count += 1;
        else bySig.set(sig, { ...f, count: 1 });
      });
    } catch {
      // Story failed to render — skip and keep going.
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
