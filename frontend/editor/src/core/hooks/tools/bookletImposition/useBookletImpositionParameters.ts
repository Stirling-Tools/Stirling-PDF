import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface BookletImpositionParameters extends BaseParameters {
  pagesPerSheet: 2;
  addBorder: boolean;
  spineLocation: "LEFT" | "RIGHT";
  addGutter: boolean;
  gutterSize: number;
  doubleSided: boolean;
  duplexPass: "BOTH" | "FIRST" | "SECOND";
  flipOnShortEdge: boolean;
}

export const defaultParameters: BookletImpositionParameters = {
  pagesPerSheet: 2,
  addBorder: false,
  spineLocation: "LEFT",
  addGutter: false,
  gutterSize: 12,
  doubleSided: true,
  duplexPass: "BOTH",
  flipOnShortEdge: false,
};

export type BookletImpositionParametersHook =
  BaseParametersHook<BookletImpositionParameters>;

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateBookletImpositionParameters(
  params: BookletImpositionParameters,
): boolean {
  return params.pagesPerSheet === 2;
}

export const useBookletImpositionParameters =
  (): BookletImpositionParametersHook => {
    return useBaseParameters({
      defaultParameters,
      endpointName: "booklet-imposition",
      validateFn: validateBookletImpositionParameters,
    });
  };
