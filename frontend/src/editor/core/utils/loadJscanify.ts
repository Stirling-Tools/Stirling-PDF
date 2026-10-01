import { withBasePath } from "@app/constants/app";

/** A single point in image space, as returned by jscanify corner detection. */
export interface JscanifyPoint {
  x: number;
  y: number;
}

/** The four detected document corners returned by {@link JscanifyScanner.getCornerPoints}. */
export interface JscanifyCornerPoints {
  topLeftCorner: JscanifyPoint;
  topRightCorner: JscanifyPoint;
  bottomLeftCorner: JscanifyPoint;
  bottomRightCorner: JscanifyPoint;
}

/** Minimal subset of an OpenCV.js `Mat` that this app interacts with directly. */
export interface OpenCVMat {
  delete(): void;
}

/** Minimal subset of the OpenCV.js runtime exposed on `window.cv`. */
export interface OpenCV {
  /** Defined only once the WASM runtime has finished initializing. */
  readonly Mat: unknown;
  imread(source: HTMLImageElement | HTMLCanvasElement | string): OpenCVMat;
}

/** The jscanify scanner instance API used by the mobile scanner. */
export interface JscanifyScanner {
  findPaperContour(image: OpenCVMat): OpenCVMat | undefined;
  getCornerPoints(contour: OpenCVMat): JscanifyCornerPoints;
  extractPaper(
    image: HTMLCanvasElement,
    resultWidth: number,
    resultHeight: number,
    cornerPoints?: JscanifyCornerPoints,
  ): HTMLCanvasElement;
}

/** Constructor for jscanify, exposed on `window.jscanify`. */
export interface JscanifyConstructor {
  new (): JscanifyScanner;
}

declare global {
  interface Window {
    cv?: OpenCV;
    jscanify?: JscanifyConstructor;
  }
}

// Served under the app's base path (handles sub-path deploys like /app).
const OPENCV_SRC = withBasePath("/vendor/jscanify/opencv.js");
const JSCANIFY_SRC = withBasePath("/vendor/jscanify/jscanify.js");

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
