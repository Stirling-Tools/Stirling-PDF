import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface ReplaceColorParameters extends BaseParameters {
  mode: "LEGACY" | "TEXT_COLOR_REPLACEMENT";
  replaceAndInvertOption:
    | "HIGH_CONTRAST_COLOR"
    | "CUSTOM_COLOR"
    | "FULL_INVERSION"
    | "COLOR_SPACE_CONVERSION";
  highContrastColorCombination:
    | "WHITE_TEXT_ON_BLACK"
    | "BLACK_TEXT_ON_WHITE"
    | "YELLOW_TEXT_ON_BLACK"
    | "GREEN_TEXT_ON_BLACK";
  textColor: string;
  backGroundColor: string;
  sourceColors: string[];
  targetColor: string;
}

export const defaultParameters: ReplaceColorParameters = {
  mode: "TEXT_COLOR_REPLACEMENT",
  replaceAndInvertOption: "HIGH_CONTRAST_COLOR",
  highContrastColorCombination: "WHITE_TEXT_ON_BLACK",
  textColor: "#000000",
  backGroundColor: "#ffffff",
  sourceColors: [],
  targetColor: "#000000",
};

export type ReplaceColorParametersHook =
  BaseParametersHook<ReplaceColorParameters>;

export const useReplaceColorParameters = (): ReplaceColorParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "replace-invert-pdf",
    validateFn: (parameters) => {
      if (parameters.mode === "TEXT_COLOR_REPLACEMENT") {
        return parameters.sourceColors.length > 0;
      }
      return true;
    },
  });
};
