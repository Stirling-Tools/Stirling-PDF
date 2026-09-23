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

/** Invert resolveConfidence, so a stored automation step reopens on the sensitivity it was saved with. */
export function sensitivityFor(
  confThreshold: number | undefined,
): DetectionSensitivity {
  if (typeof confThreshold !== "number") return "balanced";
  const match = (
    Object.entries(SENSITIVITY_CONFIDENCE) as [
      DetectionSensitivity,
      number | undefined,
    ][]
  ).find(([, value]) => value === confThreshold);
  return match ? match[0] : "balanced";
}

export type AutoFormDetectionParametersHook =
  BaseParametersHook<AutoFormDetectionParameters>;

export const useAutoFormDetectionParameters =
  (): AutoFormDetectionParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "form-detection",
    });
  };
