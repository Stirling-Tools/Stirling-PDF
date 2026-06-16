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
    // data-loaded: load event fired. data-loading: in flight.
    // Neither: foreign tag (e.g. HMR-preserved); trust the downstream
    // global check rather than wait on a load event that may already
    // have dispatched.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      if (existing.dataset.loading === "true") {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error(`Failed to load ${src}`)),
          { once: true },
        );
        return;
      }
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.loading = "true";
    script.onload = () => {
      script.dataset.loaded = "true";
      delete script.dataset.loading;
      resolve();
    };
    script.onerror = () => {
      delete script.dataset.loading;
      reject(new Error(`Failed to load ${src}`));
    };
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
  onStatus?: (status: string) => void;
}

export function loadJscanify(options: LoadJscanifyOptions = {}): Promise<void> {
  const { onStatus } = options;

  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    onStatus?.("Loading OpenCV...");
    await injectScript(OPENCV_SRC);
    // OpenCV's script load event fires before the WASM runtime is ready.
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
    await waitForGlobal(() => !!window.jscanify, "jscanify global", 5000);

    onStatus?.("Scanner ready");
  })().catch((err) => {
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}
