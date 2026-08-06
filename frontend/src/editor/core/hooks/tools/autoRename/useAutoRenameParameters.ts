import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface AutoRenameParameters extends BaseParameters {
  useFirstTextAsFallback: boolean;
}

export const defaultParameters: AutoRenameParameters = {
  useFirstTextAsFallback: false,
};

export type AutoRenameParametersHook = BaseParametersHook<AutoRenameParameters>;

export const useAutoRenameParameters = (): AutoRenameParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "auto-rename",
  });
};
