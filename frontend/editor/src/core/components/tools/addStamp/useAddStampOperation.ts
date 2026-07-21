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
  AddStampParameters,
  defaultParameters,
} from "@app/components/tools/addStamp/useAddStampParameters";

const ENDPOINT = "/api/v1/misc/add-stamp" satisfies ToolEndpoint;
type AddStampApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the add-stamp request body. The stamp
// image itself is a File and is passed via the `files` argument, not here.
export const addStampToApiParams = (
  parameters: AddStampParameters,
): AddStampApiParams => {
  const stampType = parameters.stampType || "text";
  const apiParams: AddStampApiParams = {
    stampType,
    pageNumbers: parameters.pageNumbers,
    customMargin: parameters.customMargin || "medium",
    position: parameters.position,
    fontSize: parameters.fontSize,
    rotation: parameters.rotation,
    // The UI stores opacity as a 0-100 percentage; the backend expects 0.0-1.0.
    opacity: parameters.opacity / 100,
    overrideX: parameters.overrideX,
    overrideY: parameters.overrideY,
    customColor: parameters.customColor.startsWith("#")
      ? parameters.customColor
      : `#${parameters.customColor}`,
    alphabet: parameters.alphabet,
  };

  if (stampType === "text") {
    apiParams.stampText = parameters.stampText;
  }

  return apiParams;
};

// Reconstruct the tool's UI parameters from an add-stamp request body, so a
// stored or AI-authored step can be re-rendered in the settings UI. The stamp
// image File cannot be recovered from the request model.
export const addStampFromApiParams = (
  apiParams: AddStampApiParams,
): Partial<AddStampParameters> => {
  const result: Partial<AddStampParameters> = {
    stampType: apiParams.stampType,
    pageNumbers: apiParams.pageNumbers,
    customMargin: apiParams.customMargin,
    position: apiParams.position,
    fontSize: apiParams.fontSize,
    rotation: apiParams.rotation,
    overrideX: apiParams.overrideX,
    overrideY: apiParams.overrideY,
    customColor: apiParams.customColor,
    alphabet: apiParams.alphabet,
  };

  if (apiParams.opacity !== undefined) {
    result.opacity = apiParams.opacity * 100;
  }
  if (apiParams.stampText !== undefined) {
    result.stampText = apiParams.stampText;
  }

  return result;
};

export const buildAddStampFormData = (
  parameters: AddStampParameters,
  file: File,
): FormData =>
  objectToFormData(
    addStampToApiParams(parameters),
    parameters.stampType === "image" && parameters.stampImage
      ? { fileInput: file, stampImage: parameters.stampImage }
      : { fileInput: file },
  );

export const addStampOperationConfig = defineSingleFileTool({
  buildFormData: buildAddStampFormData,
  toApiParams: addStampToApiParams,
  fromApiParams: addStampFromApiParams,
  operationType: "addStamp",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useAddStampOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddStampParameters>({
    ...addStampOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "AddStampRequest.error.failed",
        "An error occurred while adding stamp to the PDF.",
      ),
    ),
  });
};
