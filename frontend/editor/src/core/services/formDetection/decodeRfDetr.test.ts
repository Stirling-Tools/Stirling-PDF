import { describe, expect, test } from "vitest";
import { decodeRfDetr } from "@app/services/formDetection/decode";
import {
  Detection,
  ModelPipelineSpec,
  Preprocessed,
  RawOutput,
} from "@app/services/formDetection/types";
import reference from "@app/services/formDetection/__fixtures__/rfdetr-reference.json";

// The same fixture RfDetrTest.java consumes: real tensors from the exported FFDetr ONNX plus the
// detections the reference Python decode produced. Sharing it is the point - it proves the
// browser and server decoders agree with each other AND with the model, rather than merely
// agreeing with themselves.

const spec: ModelPipelineSpec = {
  decoder: "rfdetr",
  inputSize: reference.inputSize,
  resizeMode: "stretch",
  padColor: [114, 114, 114],
  channelOrder: "rgb",
  normMean: [0.485, 0.456, 0.406],
  normStd: [0.229, 0.224, 0.225],
  outputLayout: "nc_first",
  hasObjectness: false,
  classNames: ["text", "choice", "signature"],
  classFieldTypes: ["text", "checkbox", "signature"],
  scoreThreshold: reference.scoreThreshold,
  nms: "none",
  iou: 0.45,
};

/** Identity mapping so decode output is directly comparable to the reference numbers. */
const pre: Preprocessed = {
  chw: new Float32Array(0),
  inputSize: reference.inputSize,
  scaleX: 1,
  scaleY: 1,
  padX: 0,
  padY: 0,
  srcW: reference.inputSize,
  srcH: reference.inputSize,
};

function outputs(): Record<string, RawOutput> {
  const rows = reference.queries;
  const boxCols = rows[0].dets.length;
  const logitCols = rows[0].labels.length;
  const dets = new Float32Array(rows.length * boxCols);
  const labels = new Float32Array(rows.length * logitCols);
  rows.forEach((row, i) => {
    row.dets.forEach((v, c) => (dets[i * boxCols + c] = v));
    row.labels.forEach((v, c) => (labels[i * logitCols + c] = v));
  });
  return {
    dets: { data: dets, d1: rows.length, d2: boxCols },
    labels: { data: labels, d1: rows.length, d2: logitCols },
  };
}

describe("decodeRfDetr", () => {
  test("matches the Python reference decode of the exported model", () => {
    const got = decodeRfDetr(outputs(), spec, pre, spec.scoreThreshold);
    expect(got).toHaveLength(reference.expected.length);
    got.forEach((d: Detection, i: number) => {
      const want = reference.expected[i];
      expect(d.classId).toBe(want.cls);
      expect(d.score).toBeCloseTo(want.score, 4);
      expect(d.x).toBeCloseTo(want.x, 1);
      expect(d.y).toBeCloseTo(want.y, 1);
      expect(d.w).toBeCloseTo(want.w, 1);
      expect(d.h).toBeCloseTo(want.h, 1);
    });
  });

  test("finds the form's 8 text, 2 choice and 1 signature", () => {
    const got = decodeRfDetr(outputs(), spec, pre, spec.scoreThreshold);
    const byClass = (c: number) => got.filter((d) => d.classId === c).length;
    expect(byClass(0)).toBe(8);
    expect(byClass(1)).toBe(2);
    expect(byClass(2)).toBe(1);
  });

  test("binds outputs by name, not position", () => {
    const o = outputs();
    const swapped = { labels: o.labels, dets: o.dets };
    expect(decodeRfDetr(swapped, spec, pre, spec.scoreThreshold)).toEqual(
      decodeRfDetr(o, spec, pre, spec.scoreThreshold),
    );
  });

  // The exported model never lets the no-object column win (max sigmoid 0.0014 over 300
  // queries), so this case has to be built by hand to lock the guard in.
  test("never classifies a query as the trailing no-object column", () => {
    const o: Record<string, RawOutput> = {
      dets: { data: new Float32Array([0.5, 0.5, 0.2, 0.1]), d1: 1, d2: 4 },
      labels: { data: new Float32Array([-4, -3, -5, 9]), d1: 1, d2: 4 },
    };
    expect(decodeRfDetr(o, spec, pre, 0.3)).toEqual([]);
  });

  test("returns nothing when an expected output is absent", () => {
    const o = outputs();
    expect(
      decodeRfDetr({ dets: o.dets }, spec, pre, spec.scoreThreshold),
    ).toEqual([]);
  });
});
