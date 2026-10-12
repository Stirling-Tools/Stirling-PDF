import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface RemoveBlanksParameters extends BaseParameters {
  threshold: number; // 0-255
  whitePercent: number; // 0.1-100
  includeBlankPages: boolean; // whether to include detected blank pages in output
}

export const defaultParameters: RemoveBlanksParameters = {
  threshold: 10,
  whitePercent: 99.9,
  includeBlankPages: false,
};

export type RemoveBlanksParametersHook =
  BaseParametersHook<RemoveBlanksParameters>;

/** Whether these parameters are complete enough to run. Shared by the tool's settings hook
 * and its operationConfig, so the editor and the pipeline builder agree. */
export function validateRemoveBlanksParameters(
  params: RemoveBlanksParameters,
): boolean {
  return (
    params.threshold >= 0 &&
    params.threshold <= 255 &&
    params.whitePercent > 0 &&
    params.whitePercent <= 100
  );
}

export const useRemoveBlanksParameters = (): RemoveBlanksParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "remove-blanks",
    validateFn: validateRemoveBlanksParameters,
  });
};
