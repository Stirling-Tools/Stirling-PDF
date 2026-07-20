import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface FlattenParameters extends BaseParameters {
  flattenOnlyForms: boolean;
  renderDpi?: number;
}

export const defaultParameters: FlattenParameters = {
  flattenOnlyForms: false,
  renderDpi: undefined,
};

export type FlattenParametersHook = BaseParametersHook<FlattenParameters>;

export const useFlattenParameters = (): FlattenParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "flatten",
  });
};
