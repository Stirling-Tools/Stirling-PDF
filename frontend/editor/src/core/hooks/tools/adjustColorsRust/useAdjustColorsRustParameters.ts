import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";
import {
  AdjustContrastParameters,
  defaultParameters as adjustContrastDefaults,
} from "@app/hooks/tools/adjustContrast/useAdjustContrastParameters";

export const ADJUST_COLORS_RUST_ENDPOINT_NAME = "adjust-colors-rust";

export interface AdjustColorsRustParameters extends AdjustContrastParameters {
  /** Run the Rust code natively on the server instead of as wasm in the browser. */
  processOnServer: boolean;
}

export const defaultParameters: AdjustColorsRustParameters = {
  ...adjustContrastDefaults,
  processOnServer: false,
};

export type AdjustColorsRustParametersHook =
  BaseParametersHook<AdjustColorsRustParameters>;

export const useAdjustColorsRustParameters =
  (): AdjustColorsRustParametersHook =>
    useBaseParameters<AdjustColorsRustParameters>({
      defaultParameters,
      // Only the server path needs the endpoint; the browser path runs offline.
      endpointName: (params) =>
        params.processOnServer ? ADJUST_COLORS_RUST_ENDPOINT_NAME : "",
    });
