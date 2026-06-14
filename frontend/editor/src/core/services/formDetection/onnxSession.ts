// Wraps onnxruntime-web: points it at the locally-hosted CPU WASM (copied by Vite into /ort/),
// runs single-threaded (the app sets no COOP/COEP so SharedArrayBuffer threading is unavailable),
// and caches one session per model checksum. Output is returned in the same flat layout the
// backend uses so decode.ts can interpret it identically.

import * as ort from "onnxruntime-web";

import { RawOutput } from "@app/services/formDetection/types";

let configured = false;
function configureOrt(): void {
  if (configured) return;
  ort.env.wasm.numThreads = 1;
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
): Promise<RawOutput> {
  const inputName = s.inputNames[0];
  const tensor = new ort.Tensor("float32", chw, [1, 3, inputSize, inputSize]);
  const result = await s.run({ [inputName]: tensor });
  const out = result[s.outputNames[0]];
  const dims = out.dims;
  // Expect [1, d1, d2]; data is flat row-major so data[i*d2 + j] == out[0][i][j].
  const d1 = dims.length >= 2 ? Number(dims[1]) : 0;
  const d2 = dims.length >= 3 ? Number(dims[2]) : 0;
  return { data: out.data as Float32Array, d1, d2 };
}
