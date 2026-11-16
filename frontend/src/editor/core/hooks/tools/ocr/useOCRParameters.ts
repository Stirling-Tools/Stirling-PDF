import { BaseParameters } from "@editor/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@editor/hooks/tools/shared/useBaseParameters";

export interface OCRParameters extends BaseParameters {
  languages: string[];
  ocrType: string;
  ocrRenderType: string;
  additionalOptions: string[];
}

export type OCRParametersHook = BaseParametersHook<OCRParameters>;

export const defaultParameters: OCRParameters = {
  languages: [],
  ocrType: "skip-text",
  ocrRenderType: "hocr",
  additionalOptions: [],
};

/** Whether these parameters are complete enough to run. Shared by the tool's settings
 * hook and its operationConfig, so the editor and the pipeline builder agree. */
export function validateOCRParameters(params: OCRParameters): boolean {
  // At minimum, we need at least one language selected
  return params.languages.length > 0;
}

export const useOCRParameters = (): OCRParametersHook => {
  return useBaseParameters({
    defaultParameters,
    endpointName: "ocr-pdf",
    validateFn: validateOCRParameters,
  });
};
