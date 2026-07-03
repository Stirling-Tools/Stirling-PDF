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
  AddWatermarkParameters,
  defaultParameters,
} from "@app/hooks/tools/addWatermark/useAddWatermarkParameters";

const ENDPOINT = "/api/v1/security/add-watermark" satisfies ToolEndpoint;
type AddWatermarkApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the add-watermark request body. The
// watermark image itself is a File and is passed via the `files` argument.
export const addWatermarkToApiParams = (
  parameters: AddWatermarkParameters,
): AddWatermarkApiParams => {
  const watermarkType = parameters.watermarkType || "text";
  const apiParams: AddWatermarkApiParams = {
    watermarkType,
    fontSize: parameters.fontSize,
    rotation: parameters.rotation,
    // The UI stores opacity as a 0-100 percentage; the backend expects 0.0-1.0.
    opacity: parameters.opacity / 100,
    widthSpacer: parameters.widthSpacer,
    heightSpacer: parameters.heightSpacer,
    // The UI types alphabet as a free string; the wire always sends it (empty
    // string when unset) so the value is passed through and cast to the model
    // enum to preserve existing behaviour.
    alphabet: (parameters.alphabet || "") as AddWatermarkApiParams["alphabet"],
    customColor: parameters.customColor || "",
    convertPDFToImage: parameters.convertPDFToImage ?? false,
  };

  if (watermarkType === "text") {
    apiParams.watermarkText = parameters.watermarkText;
  }

  return apiParams;
};

// Reconstruct the tool's UI parameters from an add-watermark request body, so a
// stored or AI-authored step can be re-rendered in the settings UI. The
// watermark image File cannot be recovered from the request model.
export const addWatermarkFromApiParams = (
  apiParams: AddWatermarkApiParams,
): Partial<AddWatermarkParameters> => {
  const result: Partial<AddWatermarkParameters> = {
    watermarkType: apiParams.watermarkType,
    fontSize: apiParams.fontSize,
    rotation: apiParams.rotation,
    widthSpacer: apiParams.widthSpacer,
    heightSpacer: apiParams.heightSpacer,
    alphabet: apiParams.alphabet ?? defaultParameters.alphabet,
    customColor: apiParams.customColor ?? defaultParameters.customColor,
    convertPDFToImage:
      apiParams.convertPDFToImage ?? defaultParameters.convertPDFToImage,
  };

  if (apiParams.opacity !== undefined) {
    result.opacity = apiParams.opacity * 100;
  }
  if (apiParams.watermarkText !== undefined) {
    result.watermarkText = apiParams.watermarkText;
  }

  return result;
};

// Static function that can be used by both the hook and automation executor
export const buildAddWatermarkFormData = (
  parameters: AddWatermarkParameters,
  file: File,
): FormData =>
  objectToFormData(
    addWatermarkToApiParams(parameters),
    parameters.watermarkType === "image" && parameters.watermarkImage
      ? { fileInput: file, watermarkImage: parameters.watermarkImage }
      : { fileInput: file },
  );

// Static configuration object
export const addWatermarkOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAddWatermarkFormData,
  toApiParams: addWatermarkToApiParams,
  fromApiParams: addWatermarkFromApiParams,
  operationType: "watermark",
  endpoint: ENDPOINT,
  defaultParameters,
} as const;

export const useAddWatermarkOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddWatermarkParameters>({
    ...addWatermarkOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "watermark.error.failed",
        "An error occurred while adding watermark to the PDF.",
      ),
    ),
  });
};
