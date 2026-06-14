// Shared types for the in-browser Auto Form Detection pipeline. The numeric pipeline mirrors the
// backend (Yolo.java / CoordinateMapper.java) 1:1 so browser and server produce the same fields.

import { FormDetectionCatalogEntry } from "@app/hooks/useFormDetectionModelStatus";

/** Pipeline spec resolved from the active catalog entry (with backend defaults applied). */
export interface ModelPipelineSpec {
  inputSize: number;
  resizeMode: string; // "stretch" | "letterbox"
  padColor: number[];
  channelOrder: string; // "rgb" | "bgr"
  normMean: number[];
  normStd: number[];
  outputLayout: string; // "nc_first" | "anchors_first"
  hasObjectness: boolean;
  classNames: string[];
  classFieldTypes: string[];
  scoreThreshold: number;
  nms: string; // "none" | "perClass" | "classAgnostic"
  iou: number;
}

/** A detection in original bitmap-pixel space, top-left origin. */
export interface Detection {
  classId: number;
  score: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalised model input plus the transform needed to invert it. */
export interface Preprocessed {
  chw: Float32Array;
  inputSize: number;
  scaleX: number;
  scaleY: number;
  padX: number;
  padY: number;
  srcW: number;
  srcH: number;
}

/** Raw model output flattened to data[i*d2 + j] with dims d1 x d2. */
export interface RawOutput {
  data: Float32Array | number[];
  d1: number;
  d2: number;
}

export interface RectPt {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Shared output schema (mirrors the server /detect response). */
export interface DetectedField {
  type: string;
  page: number;
  rectInPdfPoints: RectPt;
  confidence: number;
}

/** Resolve a catalog entry's pipeline spec, applying the same defaults the backend uses. */
export function resolveSpec(entry: FormDetectionCatalogEntry): ModelPipelineSpec {
  return {
    inputSize: entry.inputSize > 0 ? entry.inputSize : 1216,
    resizeMode: entry.resizeMode ?? "letterbox",
    padColor: entry.padColor ?? [114, 114, 114],
    channelOrder: entry.channelOrder ?? "rgb",
    normMean: entry.normMean ?? [0, 0, 0],
    normStd: entry.normStd ?? [1, 1, 1],
    outputLayout: entry.outputLayout ?? "nc_first",
    hasObjectness: entry.hasObjectness ?? false,
    classNames: entry.classNames ?? [],
    classFieldTypes: entry.classFieldTypes ?? [],
    scoreThreshold: entry.scoreThreshold ?? 0.3,
    nms: entry.nms ?? "perClass",
    iou: entry.iou ?? 0.45,
  };
}
