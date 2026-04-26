/**
 * Dynamically loads OpenCV.js and jscanify from /vendor/jscanify/.
 *
 * Previously these were loaded via <script> tags in index.html, which meant
 * the ~2.8 MB opencv.js payload (and ~630ms of main-thread script
 * evaluation) was paid on every route, even though only the mobile scanner
 * page uses them. This helper loads them on demand and caches the load
 * promise so the network/parse cost is paid at most once per session.
 */

declare global {
  interface Window {
    cv?: any;
    jscanify?: any;
  }
}

const OPENCV_SRC = "/vendor/jscanify/opencv.js";
const JSCANIFY_SRC = "/vendor/jscanify/jscanify.js";

let loadPromise: Promise<void> | null = null;

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Reuse an existing script tag if one is already on the page (e.g. if
    // something else has injected it, or a previous load attempt inserted
    // it but hasn't finished yet).
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function waitForGlobal(
  check: () => boolean,
  name: string,
  timeoutMs: number,
  onProgress?: (elapsedMs: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (check()) {
        resolve();
        return;
      }
      const elapsed = Date.now() - start;
      if (elapsed > timeoutMs) {
        reject(new Error(`Timed out waiting for ${name}`));
        return;
      }
      onProgress?.(elapsed);
      setTimeout(tick, 100);
    };
    tick();
  });
}

export interface LoadJscanifyOptions {
  /**
   * Called with a human-readable status string while the library loads.
   * Useful for surfacing loading state in the UI.
   */
  onStatus?: (status: string) => void;
}

/**
 * Load OpenCV.js + jscanify on demand. Safe to call multiple times — only
 * the first call actually performs the load; subsequent calls return the
 * same promise. If a load fails, the cached promise is cleared so a later
 * retry is possible.
 */
export function loadJscanify(options: LoadJscanifyOptions = {}): Promise<void> {
  const { onStatus } = options;

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onStatus?.("Loading OpenCV...");
    await injectScript(OPENCV_SRC);

    // OpenCV's script tag "load" event fires before the WASM runtime is
    // ready. Poll for cv.Mat to exist before proceeding.
    await waitForGlobal(
      () => !!window.cv && !!window.cv.Mat,
      "OpenCV runtime (cv.Mat)",
      15000,
      (elapsed) => {
        if (elapsed > 2000) onStatus?.("Initializing OpenCV runtime...");
      },
    );

    onStatus?.("Loading jscanify...");
    await injectScript(JSCANIFY_SRC);

    await waitForGlobal(
      () => !!window.jscanify,
      "jscanify global",
      5000,
    );

    onStatus?.("Scanner ready");
  })().catch((err) => {
    // Reset so callers can retry on a later render.
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}
