import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface WordCountParameters extends BaseParameters {
  includePerPage: boolean;
}

export const defaultParameters: WordCountParameters = {
  includePerPage: false,
};

export type WordCountParametersHook = BaseParametersHook<WordCountParameters>;

export const useWordCountParameters = (): WordCountParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "word-count",
  });
};
