import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export type DetectionSensitivity = "low" | "balanced" | "high";

export interface AutoFormDetectionParameters extends BaseParameters {
  sensitivity: DetectionSensitivity;
  confidence?: number;
}

export const SENSITIVITY_CONFIDENCE: Record<
  DetectionSensitivity,
  number | undefined
> = {
  low: 0.45,
  balanced: undefined,
  high: 0.18,
};

export function resolveConfidence(
  parameters: AutoFormDetectionParameters,
): number | undefined {
  return typeof parameters.confidence === "number"
    ? parameters.confidence
    : SENSITIVITY_CONFIDENCE[parameters.sensitivity ?? "balanced"];
}

export const defaultParameters: AutoFormDetectionParameters = {
  sensitivity: "balanced",
};

export type AutoFormDetectionParametersHook =
  BaseParametersHook<AutoFormDetectionParameters>;

export const useAutoFormDetectionParameters =
  (): AutoFormDetectionParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "form-detection",
    });
  };
