import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  ToolType,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  CropParameters,
  defaultParameters,
} from "@app/hooks/tools/crop/useCropParameters";
import { DEFAULT_CROP_AREA } from "@app/constants/cropConstants";

const ENDPOINT = "/api/v1/general/crop" satisfies ToolEndpoint;
type CropApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the crop request body. The return type
// is the generated backend model, so a spec change that renames or drops a
// field breaks the build here.
export const cropToApiParams = (parameters: CropParameters): CropApiParams => {
  const apiParams: CropApiParams = {
    autoCrop: parameters.autoCrop,
  };

  if (!parameters.autoCrop) {
    const cropArea = parameters.cropArea;
    apiParams.x = cropArea.x;
    apiParams.y = cropArea.y;
    apiParams.width = cropArea.width;
    apiParams.height = cropArea.height;
  }

  return apiParams;
};

// Reconstruct the tool's UI parameters from a crop request body, so a stored or
// AI-authored step can be re-rendered in the settings UI.
export const cropFromApiParams = (
  apiParams: CropApiParams,
): Partial<CropParameters> => ({
  autoCrop: apiParams.autoCrop ?? defaultParameters.autoCrop,
  cropArea: {
    x: apiParams.x ?? DEFAULT_CROP_AREA.x,
    y: apiParams.y ?? DEFAULT_CROP_AREA.y,
    width: apiParams.width ?? DEFAULT_CROP_AREA.width,
    height: apiParams.height ?? DEFAULT_CROP_AREA.height,
  },
});

// Static configuration that can be used by both the hook and automation executor
export const buildCropFormData = (
  parameters: CropParameters,
  file: File,
): FormData =>
  objectToFormData(cropToApiParams(parameters), { fileInput: file });

// Static configuration object
export const cropOperationConfig = defineSingleFileTool({
  toolType: ToolType.singleFile,
  buildFormData: buildCropFormData,
  toApiParams: cropToApiParams,
  fromApiParams: cropFromApiParams,
  operationType: "crop",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useCropOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<CropParameters>({
    ...cropOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("crop.error.failed", "An error occurred while cropping the PDF."),
    ),
  });
};
