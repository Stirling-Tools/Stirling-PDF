import { BaseParameters } from "@editor/types/parameters";
import {
  BaseParametersHook,
  useBaseParameters,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface CreatePortfolioParameters extends BaseParameters {
  coverTitle: string;
}

export const defaultParameters: CreatePortfolioParameters = {
  coverTitle: "",
};

export const DEFAULT_CREATE_PORTFOLIO_PARAMETERS = defaultParameters;

export type CreatePortfolioParametersHook =
  BaseParametersHook<CreatePortfolioParameters>;

export const useCreatePortfolioParameters =
  (): CreatePortfolioParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "create-portfolio",
    });
  };
