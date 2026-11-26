import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  type BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

/**
 * Bates numbering is the same request with a fixed text, prefix + number + suffix,
 * every page numbered, and the number carrying on across the selected files.
 */
export type PageNumberingStyle = "pageNumbers" | "bates";

export const BATES_DEFAULT_DIGITS = 6;
export const BATES_MAX_DIGITS = 15;

export interface AddPageNumbersParameters extends BaseParameters {
  numberingStyle: PageNumberingStyle;
  batesPrefix: string;
  batesSuffix: string;
  customMargin: "small" | "medium" | "large" | "x-large";
  position: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  fontSize: number;
  fontType: "Times" | "Helvetica" | "Courier";
  startingNumber: number;
  pagesToNumber: string;
  customText: string;
  // Number of digits to zero-pad page numbers to. 0 = no padding.
  zeroPad: number;
}

export const defaultParameters: AddPageNumbersParameters = {
  numberingStyle: "pageNumbers",
  batesPrefix: "",
  batesSuffix: "",
  customMargin: "medium",
  position: 8, // Default to bottom center like the original HTML
  fontSize: 12,
  fontType: "Times",
  startingNumber: 1,
  pagesToNumber: "",
  customText: "",
  zeroPad: 0,
};

export type AddPageNumbersParametersHook =
  BaseParametersHook<AddPageNumbersParameters>;

export function validateAddPageNumbersParameters(
  params: AddPageNumbersParameters,
): boolean {
  if (params.fontSize <= 0 || params.startingNumber <= 0) return false;
  return (
    params.numberingStyle !== "bates" ||
    (params.zeroPad >= 1 && params.zeroPad <= BATES_MAX_DIGITS)
  );
}

/** The text each page gets, with the variables still in it. */
export function pageNumberText(params: AddPageNumbersParameters): string {
  return params.numberingStyle === "bates"
    ? `${params.batesPrefix}{n}${params.batesSuffix}`
    : params.customText;
}

export const useAddPageNumbersParameters = (): AddPageNumbersParametersHook => {
  return useBaseParameters<AddPageNumbersParameters>({
    defaultParameters,
    endpointName: "add-page-numbers",
    validateFn: validateAddPageNumbersParameters,
  });
};
