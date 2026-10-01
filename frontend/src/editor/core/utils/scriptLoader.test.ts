import { describe, it, expect } from "vitest";
import { loadScript, isScriptLoaded } from "@app/utils/scriptLoader";

/** jsdom doesn't fetch external scripts, so we drive the load/error events ourselves. */
function scriptEl(id: string): HTMLScriptElement {
  const el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) throw new Error(`no script tag #${id}`);
  return el;
}

describe("loadScript", () => {
  it("overlapping loads share one tag and resolve only after the script actually loads", async () => {
    const id = "test-script-overlap";
    const src = "https://example.test/overlap.js";

    let firstResolved = false;
    let secondResolved = false;
    const p1 = loadScript({ src, id }).then(() => {
      firstResolved = true;
    });
    // Second, overlapping call (e.g. a StrictMode double-effect or a remount before the
    // first load settled). It must reuse the in-flight load, not resolve on tag existence.
    const p2 = loadScript({ src, id }).then(() => {
      secondResolved = true;
    });

    // Only one tag despite two calls.
    expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);

    // Regression guard: before the script executes, neither promise resolves — previously
    // the second call resolved immediately because the tag existed, so callers ran before
    // the script's globals were defined (the "blank until you reopen" bug).
    await Promise.resolve();
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);
    expect(isScriptLoaded(id)).toBe(false);

    scriptEl(id).dispatchEvent(new Event("load"));
    await Promise.all([p1, p2]);
    expect(firstResolved).toBe(true);
    expect(secondResolved).toBe(true);
    expect(isScriptLoaded(id)).toBe(true);
  });

  it("resolves immediately once the script has already loaded", async () => {
    const id = "test-script-cached";
    const src = "https://example.test/cached.js";

    const first = loadScript({ src, id });
    scriptEl(id).dispatchEvent(new Event("load"));
    await first;

    // A later call must resolve from cache without waiting for a fresh load event (which
    // would never come) and without adding a second tag.
    await loadScript({ src, id });
    expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);
  });

  it("rejects when the script fails to load", async () => {
    const id = "test-script-error";
    const src = "https://example.test/error.js";

    const p = loadScript({ src, id });
    scriptEl(id).dispatchEvent(new Event("error"));
    await expect(p).rejects.toThrow(/Failed to load script/);
  });

  it("drops the failed tag so a retry re-attempts instead of hanging", async () => {
    const id = "test-script-retry";
    const src = "https://example.test/retry.js";

    // First attempt (e.g. a warm-up) fails.
    const first = loadScript({ src, id });
    scriptEl(id).dispatchEvent(new Event("error"));
    await expect(first).rejects.toThrow(/Failed to load script/);
    // The poisoned tag must be gone — otherwise a retry would attach to a dead tag.
    expect(document.querySelectorAll(`#${id}`)).toHaveLength(0);

    // Retry (e.g. the modal opening) creates a fresh tag and can now succeed.
    const second = loadScript({ src, id });
    expect(document.querySelectorAll(`#${id}`)).toHaveLength(1);
    scriptEl(id).dispatchEvent(new Event("load"));
    await expect(second).resolves.toBeUndefined();
    expect(isScriptLoaded(id)).toBe(true);
  });
});
