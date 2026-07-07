import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  BookletImpositionParameters,
  defaultParameters,
} from "@app/hooks/tools/bookletImposition/useBookletImpositionParameters";

const ENDPOINT = "/api/v1/general/booklet-imposition" satisfies ToolEndpoint;
type BookletImpositionApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the booklet-imposition request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const bookletImpositionToApiParams = (
  parameters: BookletImpositionParameters,
): BookletImpositionApiParams => ({
  pagesPerSheet: parameters.pagesPerSheet,
  addBorder: parameters.addBorder,
  spineLocation: parameters.spineLocation,
  addGutter: parameters.addGutter,
  gutterSize: parameters.gutterSize,
  doubleSided: parameters.doubleSided,
  duplexPass: parameters.duplexPass,
  flipOnShortEdge: parameters.flipOnShortEdge,
});

// Reconstruct the tool's UI parameters from a booklet-imposition request body,
// so a stored or AI-authored step can be re-rendered in the settings UI.
export const bookletImpositionFromApiParams = (
  apiParams: BookletImpositionApiParams,
): Partial<BookletImpositionParameters> => ({
  pagesPerSheet: apiParams.pagesPerSheet ?? defaultParameters.pagesPerSheet,
  addBorder: apiParams.addBorder ?? defaultParameters.addBorder,
  spineLocation: apiParams.spineLocation ?? defaultParameters.spineLocation,
  addGutter: apiParams.addGutter ?? defaultParameters.addGutter,
  gutterSize: apiParams.gutterSize ?? defaultParameters.gutterSize,
  doubleSided: apiParams.doubleSided ?? defaultParameters.doubleSided,
  duplexPass: apiParams.duplexPass ?? defaultParameters.duplexPass,
  flipOnShortEdge:
    apiParams.flipOnShortEdge ?? defaultParameters.flipOnShortEdge,
});

// Static configuration that can be used by both the hook and automation executor
export const buildBookletImpositionFormData = (
  parameters: BookletImpositionParameters,
  file: File,
): FormData =>
  objectToFormData(bookletImpositionToApiParams(parameters), {
    fileInput: file,
  });

// Static configuration object
export const bookletImpositionOperationConfig = defineSingleFileTool({
  buildFormData: buildBookletImpositionFormData,
  toApiParams: bookletImpositionToApiParams,
  fromApiParams: bookletImpositionFromApiParams,
  operationType: "bookletImposition",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useBookletImpositionOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<BookletImpositionParameters>({
    ...bookletImpositionOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "bookletImposition.error.failed",
        "An error occurred while creating the booklet imposition.",
      ),
    ),
  });
};
