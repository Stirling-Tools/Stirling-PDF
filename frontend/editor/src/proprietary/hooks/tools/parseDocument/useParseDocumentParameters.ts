import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export type DocparseMode = "auto" | "basic" | "advanced";

export interface ParseDocumentParameters extends BaseParameters {
  mode: DocparseMode;
  outputFormat: "json" | "markdown";
  withOcr: boolean;
}

// withOcr defaults true to match the API's default behaviour.
export const defaultParameters: ParseDocumentParameters = {
  mode: "auto",
  outputFormat: "json",
  withOcr: true,
};

export type ParseDocumentParametersHook =
  BaseParametersHook<ParseDocumentParameters>;

export const useParseDocumentParameters = (): ParseDocumentParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "parse-document",
  });
};
