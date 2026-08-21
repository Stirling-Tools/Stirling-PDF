/**
 * Utility for dynamically loading external scripts
 */

interface ScriptLoadOptions {
  src: string;
  id?: string;
  async?: boolean;
  defer?: boolean;
  onLoad?: () => void;
}

const loadedScripts = new Set<string>();
// Loads that have started but not yet finished, keyed by script id/src. Overlapping
// callers (e.g. a React StrictMode double-effect, or a component that remounts before
// the previous load settled) reuse the same promise so they all resolve only when the
// script has actually executed — never on tag existence alone.
const pendingScripts = new Map<string, Promise<void>>();

export function loadScript({
  src,
  id,
  async = true,
  defer = false,
  onLoad,
}: ScriptLoadOptions): Promise<void> {
  const scriptId = id || src;

  // Already fully loaded and executed.
  if (loadedScripts.has(scriptId)) {
    onLoad?.();
    return Promise.resolve();
  }

  // A load for the same script is already in flight — wait for it rather than kicking
  // off a second one (and, critically, don't resolve just because the tag is present).
  const inFlight = pendingScripts.get(scriptId);
  if (inFlight) {
    return onLoad ? inFlight.then(() => onLoad()) : inFlight;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const settleLoaded = (script: HTMLScriptElement) => {
      script.dataset.loaded = "true";
      loadedScripts.add(scriptId);
      pendingScripts.delete(scriptId);
      onLoad?.();
      resolve();
    };
    const settleError = (el: HTMLScriptElement) => {
      pendingScripts.delete(scriptId);
      // Drop the failed tag so a later retry (e.g. the modal after a warm-up that was
      // blocked by an extension) creates a fresh one and re-attempts, rather than
      // attaching to a dead tag whose error event won't fire again and hanging forever.
      el.remove();
      reject(new Error(`Failed to load script: ${src}`));
    };

    // A matching tag may already be in the DOM (added by an earlier load whose Set/Map
    // state was lost, or injected elsewhere). If our own loader finished it, the
    // data-loaded flag is set and we can resolve immediately; otherwise attach to its
    // load lifecycle instead of assuming it is ready.
    const existing = (
      id
        ? document.getElementById(id)
        : document.querySelector(`script[src="${src}"]`)
    ) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") {
        loadedScripts.add(scriptId);
        onLoad?.();
        resolve();
        return;
      }
      existing.addEventListener("load", () => settleLoaded(existing), {
        once: true,
      });
      existing.addEventListener("error", () => settleError(existing), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    if (id) script.id = id;
    script.async = async;
    script.defer = defer;
    script.addEventListener("load", () => settleLoaded(script), { once: true });
    script.addEventListener("error", () => settleError(script), { once: true });
    document.head.appendChild(script);
  });

  pendingScripts.set(scriptId, promise);
  return promise;
}

export function isScriptLoaded(idOrSrc: string): boolean {
  return loadedScripts.has(idOrSrc);
}
