// Wraps onnxruntime-web: points it at the locally-hosted CPU WASM (copied by Vite into /ort/),
// runs single-threaded (the app sets no COOP/COEP so SharedArrayBuffer threading is unavailable),
// and caches one session per model checksum. Output is returned in the same flat layout the
// backend uses so decode.ts can interpret it identically.
//
// The /wasm subpath entry is deliberate: the package root also bundles the WebGPU and WebGL
// backends, which this code never selects - and its WebGPU runtime is a second 26MB .wasm that
// Rollup emits alongside the CPU one. vite.config.ts pins the subpath to onnxruntime's
// extern-wasm build, so exactly one runtime ships: the copy under /ort/.

import * as ort from "onnxruntime-web/wasm";

import { RawOutput } from "@app/services/formDetection/types";

let configured = false;
function configureOrt(): void {
  if (configured) return;
  ort.env.wasm.numThreads = 1;
  // Run the session on a worker thread. Inference is ~15s per page and would otherwise block the
  // main thread outright - a frozen tab with a stalled progress bar. This does not make it faster,
  // it keeps the app responsive while it runs. (numThreads stays 1: multi-threading needs
  // SharedArrayBuffer, which needs COOP/COEP headers the app does not set.)
  ort.env.wasm.proxy = true;
  // The CPU SIMD .wasm + its loader are copied next to the app under /ort/ by vite.config.ts.
  ort.env.wasm.wasmPaths = new URL("ort/", document.baseURI).href;
  configured = true;
}

let session: ort.InferenceSession | null = null;
let sessionKey: string | null = null;

/** Create (or reuse) a session for the given model bytes; keyed by checksum so swaps reload. */
export async function getSession(
  modelBytes: ArrayBuffer,
  key: string,
): Promise<ort.InferenceSession> {
  configureOrt();
  if (session && sessionKey === key) return session;
  if (session) {
    try {
      await session.release();
    } catch {
      // ignore
    }
    session = null;
    sessionKey = null;
  }
  session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  sessionKey = key;
  return session;
}

export async function runInference(
  s: ort.InferenceSession,
  chw: Float32Array,
  inputSize: number,
): Promise<Record<string, RawOutput>> {
  const inputName = s.inputNames[0];
  const tensor = new ort.Tensor("float32", chw, [1, 3, inputSize, inputSize]);
  const result = await s.run({ [inputName]: tensor });
  // Keyed by name, in graph order: a query head emits two tensors of the SAME shape (dets and
  // labels are both [1, 300, 4] at three classes), so position cannot tell them apart.
  const outputs: Record<string, RawOutput> = {};
  for (const name of s.outputNames) {
    const out = result[name];
    const dims = out.dims;
    // Expect [1, d1, d2]; data is flat row-major so data[i*d2 + j] == out[0][i][j].
    const d1 = dims.length >= 2 ? Number(dims[1]) : 0;
    const d2 = dims.length >= 3 ? Number(dims[2]) : 0;
    outputs[name] = { data: out.data as Float32Array, d1, d2 };
  }
  return outputs;
}
