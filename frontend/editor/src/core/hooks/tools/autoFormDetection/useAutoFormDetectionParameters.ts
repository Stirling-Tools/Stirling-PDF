import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface AutoFormDetectionParameters extends BaseParameters {
  /** Optional confidence threshold override (0-1); blank uses the model default. */
  confidence?: number;
}

export const defaultParameters: AutoFormDetectionParameters = {};

export type AutoFormDetectionParametersHook =
  BaseParametersHook<AutoFormDetectionParameters>;

export const useAutoFormDetectionParameters =
  (): AutoFormDetectionParametersHook => {
    return useBaseParameters({
      defaultParameters,
      // Gated endpoint key - the tool tile/button stay disabled until a model is installed.
      endpointName: "form-detection",
    });
  };
