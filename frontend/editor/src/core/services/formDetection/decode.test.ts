import { describe, it, expect } from "vitest";

import { decode } from "@app/services/formDetection/decode";
import {
  ModelPipelineSpec,
  Preprocessed,
  RawOutput,
} from "@app/services/formDetection/types";

// Golden fixture shared VERBATIM with the backend YoloTest.java
// (decodeThresholdsAndSuppressesOverlaps). Asserting the same inputs -> same outputs in both
// suites proves the in-browser decode matches the server decode 1:1, so the two execution paths
// produce identical detections.

const spec: ModelPipelineSpec = {
  inputSize: 10,
  resizeMode: "letterbox",
  padColor: [114, 114, 114],
  channelOrder: "rgb",
  normMean: [0, 0, 0],
  normStd: [1, 1, 1],
  outputLayout: "nc_first",
  hasObjectness: false,
  classNames: ["text", "choice"],
  classFieldTypes: ["text", "checkbox"],
  scoreThreshold: 0.5,
  nms: "perClass",
  iou: 0.5,
};

// identity transform (scale 1, no pad), 10x10 source
const pre: Preprocessed = {
  chw: new Float32Array(0),
  inputSize: 10,
  scaleX: 1,
  scaleY: 1,
  padX: 0,
  padY: 0,
  srcW: 10,
  srcH: 10,
};

// nc_first layout [channels=6][anchors=3], data[c*anchors + a]
// box A (cx5,cy5,w4,h4) twice (overlapping) + box B (cx8,cy8,w2,h2)
const data = [
  5,
  5,
  8, // cx
  5,
  5,
  8, // cy
  4,
  4,
  2, // w
  4,
  4,
  2, // h
  0.9,
  0.8,
  0.7, // text score
  0.1,
  0.1,
  0.1, // choice score
];
const out: RawOutput = { data, d1: 6, d2: 3 };

describe("formDetection decode (parity with backend Yolo.decode)", () => {
  it("thresholds and suppresses overlaps identically to the Java golden fixture", () => {
    const dets = decode(out, spec, pre, 0.5);
    // a0 (box A, 0.9) kept; a1 (box A', 0.8) suppressed by NMS; a2 (box B, 0.7) kept
    expect(dets).toHaveLength(2);

    expect(dets[0].classId).toBe(0);
    expect(dets[0].score).toBeCloseTo(0.9, 5);
    expect(dets[0].x).toBeCloseTo(3, 4);
    expect(dets[0].y).toBeCloseTo(3, 4);
    expect(dets[0].w).toBeCloseTo(4, 4);
    expect(dets[0].h).toBeCloseTo(4, 4);

    expect(dets[1].score).toBeCloseTo(0.7, 5);
    expect(dets[1].x).toBeCloseTo(7, 4);
    expect(dets[1].y).toBeCloseTo(7, 4);
    expect(dets[1].w).toBeCloseTo(2, 4);
    expect(dets[1].h).toBeCloseTo(2, 4);
  });

  it("drops everything when the threshold exceeds all scores", () => {
    expect(decode(out, spec, pre, 0.95)).toHaveLength(0);
  });
});
