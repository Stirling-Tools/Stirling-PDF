import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export type AutoRotateDetectionMode = "auto" | "text" | "osd";

export interface AutoRotateParameters extends BaseParameters {
  /** auto = embedded-text direction first, OSD fallback; text/osd force one method. */
  detectionMode: AutoRotateDetectionMode;
  /** Minimum Tesseract OSD confidence before a correction is applied. */
  confidenceThreshold: number;
  /** Give undetected pages the document's consensus rotation when its pages agree. */
  inferUndetected: boolean;
}

export const defaultParameters: AutoRotateParameters = {
  detectionMode: "auto",
  confidenceThreshold: 14,
  inferUndetected: true,
};

export type AutoRotateParametersHook = BaseParametersHook<AutoRotateParameters>;

export function validateAutoRotateParameters(
  params: AutoRotateParameters,
): boolean {
  return params.confidenceThreshold >= 0;
}

export const useAutoRotateParameters = (): AutoRotateParametersHook =>
  useBaseParameters({
    defaultParameters,
    endpointName: "auto-rotate-pdf",
    validateFn: validateAutoRotateParameters,
  });
