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
  PageLayoutParameters,
  defaultParameters,
} from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

const ENDPOINT = "/api/v1/general/multi-page-layout" satisfies ToolEndpoint;
type PageLayoutApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the multi-page-layout request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const pageLayoutToApiParams = (
  parameters: PageLayoutParameters,
): PageLayoutApiParams => ({
  mode: parameters.mode,
  pagesPerSheet:
    parameters.pagesPerSheet as PageLayoutApiParams["pagesPerSheet"],
  rows: parameters.rows,
  cols: parameters.cols,
  orientation: parameters.orientation,
  arrangement: parameters.arrangement,
  readingDirection: parameters.readingDirection,
  innerMargin: parameters.innerMargin ?? 0,
  topMargin: parameters.topMargin ?? 0,
  bottomMargin: parameters.bottomMargin ?? 0,
  leftMargin: parameters.leftMargin ?? 0,
  rightMargin: parameters.rightMargin ?? 0,
  addBorder: parameters.addBorder,
  borderWidth: parameters.borderWidth ?? 1,
});

// Reconstruct the tool's UI parameters from a multi-page-layout request body, so
// a stored or AI-authored step can be re-rendered in the settings UI.
export const pageLayoutFromApiParams = (
  apiParams: PageLayoutApiParams,
): Partial<PageLayoutParameters> => ({
  mode: apiParams.mode,
  pagesPerSheet: apiParams.pagesPerSheet,
  rows: apiParams.rows,
  cols: apiParams.cols,
  orientation: apiParams.orientation,
  arrangement: apiParams.arrangement,
  readingDirection: apiParams.readingDirection,
  innerMargin: apiParams.innerMargin,
  topMargin: apiParams.topMargin,
  bottomMargin: apiParams.bottomMargin,
  leftMargin: apiParams.leftMargin,
  rightMargin: apiParams.rightMargin,
  addBorder: apiParams.addBorder,
  borderWidth: apiParams.borderWidth,
});

export const buildPageLayoutFormData = (
  parameters: PageLayoutParameters,
  file: File,
): FormData =>
  objectToFormData(pageLayoutToApiParams(parameters), { fileInput: file });

export const pageLayoutOperationConfig = defineSingleFileTool({
  buildFormData: buildPageLayoutFormData,
  toApiParams: pageLayoutToApiParams,
  fromApiParams: pageLayoutFromApiParams,
  operationType: "pageLayout",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const usePageLayoutOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<PageLayoutParameters>({
    ...pageLayoutOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "pageLayout.error.failed",
        "An error occurred while creating the multi-page layout.",
      ),
    ),
  });
};
