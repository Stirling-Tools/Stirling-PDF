import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  ToolType,
} from "@app/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  RotateParameters,
  defaultParameters,
  normalizeAngle,
} from "@app/hooks/tools/rotate/useRotateParameters";

const ENDPOINT = "/api/v1/general/rotate-pdf" satisfies ToolEndpoint;
type RotateApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the rotate-pdf request body. The return
// type is the generated backend model, so a spec change breaks the build here.
export const rotateToApiParams = (
  parameters: RotateParameters,
): RotateApiParams => ({
  // The UI angle can be any multiple of 90 (including negatives or values above
  // 360); normalize to the four values the backend accepts.
  angle: normalizeAngle(parameters.angle) as RotateApiParams["angle"],
});

// Reconstruct the tool's UI parameters from a rotate-pdf request body.
export const rotateFromApiParams = (
  apiParams: RotateApiParams,
): Partial<RotateParameters> => ({
  angle: apiParams.angle,
});

// Static configuration that can be used by both the hook and automation executor
export const buildRotateFormData = (
  parameters: RotateParameters,
  file: File,
): FormData =>
  objectToFormData(rotateToApiParams(parameters), { fileInput: file });

// Static configuration object
export const rotateOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildRotateFormData,
  toApiParams: rotateToApiParams,
  fromApiParams: rotateFromApiParams,
  operationType: "rotate",
  endpoint: ENDPOINT,
  defaultParameters,
} as const;

export const useRotateOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RotateParameters>({
    ...rotateOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t("rotate.error.failed", "An error occurred while rotating the PDF."),
    ),
  });
};
