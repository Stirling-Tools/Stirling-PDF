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
  ChangePermissionsParameters,
  defaultParameters,
} from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";

// Change Permissions reuses the Add Password endpoint but sends only the
// prevent* subset of the request model (no password or keyLength).
const ENDPOINT = "/api/v1/security/add-password" satisfies ToolEndpoint;
type AddPasswordApiParams = ToolApiParams[typeof ENDPOINT];

// Retained for backwards compatibility with existing callers.
export const getFormData = (parameters: ChangePermissionsParameters) => {
  if (!parameters) return [];
  return Object.entries(parameters).map(([key, value]) => [
    key,
    (value ?? false).toString(),
  ]) as string[][];
};

// Convert the tool's UI parameters into the add-password request body. Only the
// prevent* permission flags are sent; keyLength/password are intentionally
// omitted to preserve the existing wire behaviour, so the result is cast to the
// shared request model.
export const changePermissionsToApiParams = (
  parameters: ChangePermissionsParameters,
): AddPasswordApiParams =>
  ({
    preventAssembly: parameters.preventAssembly ?? false,
    preventExtractContent: parameters.preventExtractContent ?? false,
    preventExtractForAccessibility:
      parameters.preventExtractForAccessibility ?? false,
    preventFillInForm: parameters.preventFillInForm ?? false,
    preventModify: parameters.preventModify ?? false,
    preventModifyAnnotations: parameters.preventModifyAnnotations ?? false,
    preventPrinting: parameters.preventPrinting ?? false,
    preventPrintingFaithful: parameters.preventPrintingFaithful ?? false,
  }) as AddPasswordApiParams;

// Reconstruct the tool's UI parameters from an add-password request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const changePermissionsFromApiParams = (
  apiParams: AddPasswordApiParams,
): Partial<ChangePermissionsParameters> => ({
  preventAssembly: apiParams.preventAssembly ?? false,
  preventExtractContent: apiParams.preventExtractContent ?? false,
  preventExtractForAccessibility:
    apiParams.preventExtractForAccessibility ?? false,
  preventFillInForm: apiParams.preventFillInForm ?? false,
  preventModify: apiParams.preventModify ?? false,
  preventModifyAnnotations: apiParams.preventModifyAnnotations ?? false,
  preventPrinting: apiParams.preventPrinting ?? false,
  preventPrintingFaithful: apiParams.preventPrintingFaithful ?? false,
});

// Static function that can be used by both the hook and automation executor
export const buildChangePermissionsFormData = (
  parameters: ChangePermissionsParameters,
  file: File,
): FormData =>
  objectToFormData(changePermissionsToApiParams(parameters), {
    fileInput: file,
  });

// Static configuration object
export const changePermissionsOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildChangePermissionsFormData,
  toApiParams: changePermissionsToApiParams,
  fromApiParams: changePermissionsFromApiParams,
  operationType: "changePermissions",
  endpoint: ENDPOINT, // Change Permissions is a fake endpoint for the Add Password tool
  defaultParameters,
} as const;

export const useChangePermissionsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation({
    ...changePermissionsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "changePermissions.error.failed",
        "An error occurred while changing PDF permissions.",
      ),
    ),
  });
};
