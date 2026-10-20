import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export const CLASSIFY_RUST_ENDPOINT_NAME = "classify-rust";

export interface ClassifyRustParameters {
  /** Run the Rust classifier natively on the server instead of as wasm in the browser. */
  processOnServer: boolean;
}

export const defaultParameters: ClassifyRustParameters = {
  processOnServer: false,
};

export type ClassifyRustParametersHook =
  BaseParametersHook<ClassifyRustParameters>;

export const useClassifyRustParameters = (): ClassifyRustParametersHook =>
  useBaseParameters<ClassifyRustParameters>({
    defaultParameters,
    // Only the server path needs the endpoint; the browser path runs offline.
    endpointName: (params) =>
      params.processOnServer ? CLASSIFY_RUST_ENDPOINT_NAME : "",
  });
