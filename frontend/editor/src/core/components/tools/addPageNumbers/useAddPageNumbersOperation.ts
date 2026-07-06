import { useTranslation } from "react-i18next";
import {
  ToolType,
  useToolOperation,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  AddPageNumbersParameters,
  defaultParameters,
} from "@app/components/tools/addPageNumbers/useAddPageNumbersParameters";

const ENDPOINT = "/api/v1/misc/add-page-numbers" satisfies ToolEndpoint;
type AddPageNumbersApiParams = ToolApiParams[typeof ENDPOINT];

// The UI labels fonts capitalized while the backend model uses lowercase; these
// maps translate between them so both mappers type-check without casting.
const FONT_TYPE_TO_API = {
  Times: "times",
  Helvetica: "helvetica",
  Courier: "courier",
} as const satisfies Record<
  AddPageNumbersParameters["fontType"],
  AddPageNumbersApiParams["fontType"]
>;
const FONT_TYPE_FROM_API = {
  times: "Times",
  helvetica: "Helvetica",
  courier: "Courier",
} as const satisfies Record<
  AddPageNumbersApiParams["fontType"],
  AddPageNumbersParameters["fontType"]
>;

// Convert the tool's UI parameters into the add-page-numbers request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const addPageNumbersToApiParams = (
  parameters: AddPageNumbersParameters,
): AddPageNumbersApiParams => ({
  customMargin: parameters.customMargin,
  position: parameters.position,
  fontSize: parameters.fontSize,
  fontType: FONT_TYPE_TO_API[parameters.fontType],
  startingNumber: parameters.startingNumber,
  pagesToNumber: parameters.pagesToNumber,
  customText: parameters.customText,
  zeroPad: parameters.zeroPad,
});

// Reconstruct the tool's UI parameters from an add-page-numbers request body,
// so a stored or AI-authored step can be re-rendered in the settings UI.
export const addPageNumbersFromApiParams = (
  apiParams: AddPageNumbersApiParams,
): Partial<AddPageNumbersParameters> => ({
  customMargin: apiParams.customMargin,
  position: apiParams.position,
  fontSize: apiParams.fontSize,
  fontType: FONT_TYPE_FROM_API[apiParams.fontType],
  startingNumber: apiParams.startingNumber,
  pagesToNumber: apiParams.pagesToNumber,
  customText: apiParams.customText,
  zeroPad: apiParams.zeroPad,
});

export const buildAddPageNumbersFormData = (
  parameters: AddPageNumbersParameters,
  file: File,
): FormData =>
  objectToFormData(addPageNumbersToApiParams(parameters), { fileInput: file });

export const addPageNumbersOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAddPageNumbersFormData,
  toApiParams: addPageNumbersToApiParams,
  fromApiParams: addPageNumbersFromApiParams,
  operationType: "addPageNumbers",
  endpoint: ENDPOINT,
  defaultParameters,
} as const;

export const useAddPageNumbersOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddPageNumbersParameters>({
    ...addPageNumbersOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "addPageNumbers.error.failed",
        "An error occurred while adding page numbers to the PDF.",
      ),
    ),
  });
};
