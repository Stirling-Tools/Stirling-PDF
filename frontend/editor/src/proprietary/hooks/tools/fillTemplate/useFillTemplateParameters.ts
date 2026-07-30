import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface FillTemplateParameters extends BaseParameters {
  /** JSON object whose keys fill the template's placeholders. */
  dataJson: string;
}

export const defaultParameters: FillTemplateParameters = {
  dataJson: "",
};

/** True when the text parses to a plain JSON object. */
export function isJsonObjectString(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}

export type FillTemplateParametersHook =
  BaseParametersHook<FillTemplateParameters>;

export const useFillTemplateParameters = (): FillTemplateParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "fill-template",
    validateFn: (params) => isJsonObjectString(params.dataJson),
  });
};
