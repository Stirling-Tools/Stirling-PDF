// Letterbox/stretch-resize, channel-swap, normalise and lay out as NCHW float32 - the browser
// counterpart of Yolo.preprocess. The resize uses a 2D canvas (bilinear-ish); the normalisation
// step is split out as a pure function so it can be unit-tested against the Java golden vectors.

import {
  ModelPipelineSpec,
  Preprocessed,
} from "@app/services/formDetection/types";

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function orZeros(v?: number[]): number[] {
  return v && v.length >= 3 ? v : [0, 0, 0];
}

function orOnes(v?: number[]): number[] {
  return v && v.length >= 3 ? v : [1, 1, 1];
}

/** Pure: turn an NxN RGBA buffer into normalised NCHW float32 per the spec. */
export function normalizeToCHW(
  rgbaNxN: Uint8ClampedArray | Uint8Array,
  n: number,
  spec: ModelPipelineSpec,
): Float32Array {
  const bgr = (spec.channelOrder ?? "").toLowerCase() === "bgr";
  const mean = orZeros(spec.normMean);
  const std = orOnes(spec.normStd);
  const plane = n * n;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const r = rgbaNxN[i * 4] / 255;
    const g = rgbaNxN[i * 4 + 1] / 255;
    const b = rgbaNxN[i * 4 + 2] / 255;
    const c0 = bgr ? b : r;
    const c1 = g;
    const c2 = bgr ? r : b;
    chw[i] = (c0 - mean[0]) / std[0];
    chw[plane + i] = (c1 - mean[1]) / std[1];
    chw[2 * plane + i] = (c2 - mean[2]) / std[2];
  }
  return chw;
}

/** Browser: resize source RGBA into the model's NxN input and normalise to NCHW float32. */
export function preprocess(
  rgba: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  spec: ModelPipelineSpec,
): Preprocessed {
  const n = spec.inputSize;
  const letterbox = (spec.resizeMode ?? "").toLowerCase() !== "stretch";

  let scaleX: number;
  let scaleY: number;
  let padX: number;
  let padY: number;
  let drawW: number;
  let drawH: number;
  if (letterbox) {
    const scale = Math.min(n / srcW, n / srcH);
    drawW = Math.max(1, Math.round(srcW * scale));
    drawH = Math.max(1, Math.round(srcH * scale));
    padX = Math.floor((n - drawW) / 2);
    padY = Math.floor((n - drawH) / 2);
    scaleX = scale;
    scaleY = scale;
  } else {
    drawW = n;
    drawH = n;
    padX = 0;
    padY = 0;
    scaleX = n / srcW;
    scaleY = n / srcH;
  }

  const pad = spec.padColor ?? [114, 114, 114];
  const canvas = document.createElement("canvas");
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.fillStyle = `rgb(${clampByte(pad[0] ?? 114)},${clampByte(pad[1] ?? 114)},${clampByte(pad[2] ?? 114)})`;
  ctx.fillRect(0, 0, n, n);

  // Source RGBA -> temp canvas, then draw scaled into the padded NxN canvas.
  const src = document.createElement("canvas");
  src.width = srcW;
  src.height = srcH;
  const sctx = src.getContext("2d");
  if (!sctx) throw new Error("2D canvas context unavailable");
  // Copy into a fresh ArrayBuffer-backed array: ImageData's type rejects the
  // Uint8ClampedArray<ArrayBufferLike> form (TS 5.7 typed-array generics).
  const buf = new Uint8ClampedArray(rgba);
  sctx.putImageData(new ImageData(buf, srcW, srcH), 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, padX, padY, drawW, drawH);

  const px = ctx.getImageData(0, 0, n, n).data;
  const chw = normalizeToCHW(px, n, spec);
  return { chw, inputSize: n, scaleX, scaleY, padX, padY, srcW, srcH };
}
