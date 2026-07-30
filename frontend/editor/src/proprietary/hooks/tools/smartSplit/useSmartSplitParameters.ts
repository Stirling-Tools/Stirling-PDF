import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface SmartSplitParameters extends BaseParameters {
  /** Natural-language boundary rule, e.g. "split at each new invoice". */
  rule: string;
  maxParts: number;
}

export const defaultParameters: SmartSplitParameters = {
  rule: "",
  maxParts: 10,
};

export type SmartSplitParametersHook = BaseParametersHook<SmartSplitParameters>;

export const useSmartSplitParameters = (): SmartSplitParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "smart-split",
    validateFn: (params) =>
      params.rule.trim().length > 0 && params.maxParts > 0,
  });
};
