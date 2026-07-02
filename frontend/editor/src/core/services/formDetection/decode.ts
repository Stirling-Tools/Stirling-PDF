// Pure decode/NMS/un-projection - a 1:1 port of Yolo.decode in the backend. Kept free of any
// browser API so it can be unit-tested for parity against the Java golden output.

import {
  Detection,
  ModelPipelineSpec,
  Preprocessed,
  RawOutput,
} from "@app/services/formDetection/types";

function at(
  data: Float32Array | number[],
  ncFirst: boolean,
  anchors: number,
  channels: number,
  c: number,
  a: number,
): number {
  return ncFirst ? data[c * anchors + a] : data[a * channels + c];
}

function iou(a: Detection, b: Detection): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

function nms(
  dets: Detection[],
  mode: string,
  iouThreshold: number,
): Detection[] {
  if (dets.length < 2 || (mode ?? "").toLowerCase() === "none") {
    return dets;
  }
  const classAgnostic = (mode ?? "").toLowerCase().includes("agnostic");
  const sorted = [...dets].sort((x, y) => y.score - x.score);
  const removed = new Array<boolean>(sorted.length).fill(false);
  const keep: Detection[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (removed[i]) continue;
    const di = sorted[i];
    keep.push(di);
    for (let j = i + 1; j < sorted.length; j++) {
      if (removed[j]) continue;
      const dj = sorted[j];
      if (!classAgnostic && di.classId !== dj.classId) continue;
      if (iou(di, dj) > iouThreshold) removed[j] = true;
    }
  }
  return keep;
}

/** Decode raw output, threshold, NMS, and un-project to original bitmap pixels. */
export function decode(
  out: RawOutput,
  spec: ModelPipelineSpec,
  pre: Preprocessed,
  scoreThreshold: number,
): Detection[] {
  const numClasses = spec.classNames?.length ?? 0;
  if (numClasses === 0) return [];
  const obj = spec.hasObjectness;
  const ncFirst = (spec.outputLayout ?? "").toLowerCase() !== "anchors_first";
  const channels = ncFirst ? out.d1 : out.d2;
  const anchors = ncFirst ? out.d2 : out.d1;
  const expected = 4 + (obj ? 1 : 0) + numClasses;
  if (channels < expected) {
    return [];
  }
  const classOffset = 4 + (obj ? 1 : 0);
  const data = out.data;

  const dets: Detection[] = [];
  for (let a = 0; a < anchors; a++) {
    const objScore = obj ? at(data, ncFirst, anchors, channels, 4, a) : 1;
    let bestClass = -1;
    let bestScore = 0;
    for (let c = 0; c < numClasses; c++) {
      const s =
        at(data, ncFirst, anchors, channels, classOffset + c, a) * objScore;
      if (s > bestScore) {
        bestScore = s;
        bestClass = c;
      }
    }
    if (bestClass < 0 || bestScore < scoreThreshold) continue;
    const cx = at(data, ncFirst, anchors, channels, 0, a);
    const cy = at(data, ncFirst, anchors, channels, 1, a);
    const w = at(data, ncFirst, anchors, channels, 2, a);
    const h = at(data, ncFirst, anchors, channels, 3, a);
    const x1 = cx - w / 2;
    const y1 = cy - h / 2;
    const ox = (x1 - pre.padX) / pre.scaleX;
    const oy = (y1 - pre.padY) / pre.scaleY;
    let ow = w / pre.scaleX;
    let oh = h / pre.scaleY;
    const cxl = Math.max(0, Math.min(ox, pre.srcW));
    const cyl = Math.max(0, Math.min(oy, pre.srcH));
    ow = Math.max(0, Math.min(ow, pre.srcW - cxl));
    oh = Math.max(0, Math.min(oh, pre.srcH - cyl));
    if (ow <= 0 || oh <= 0) continue;
    dets.push({
      classId: bestClass,
      score: bestScore,
      x: cxl,
      y: cyl,
      w: ow,
      h: oh,
    });
  }
  return nms(dets, spec.nms, spec.iou);
}
