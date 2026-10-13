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
  ChangePermissionsParameters,
  defaultParameters,
  validateChangePermissionsParameters,
} from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";

// No keyLength distinguishes a permissions-only step from Add Password.
const ENDPOINT = "/api/v1/security/add-password" satisfies ToolEndpoint;
type AddPasswordApiParams = ToolApiParams[typeof ENDPOINT];

export const changePermissionsToApiParams = (
  parameters: ChangePermissionsParameters,
): AddPasswordApiParams => ({
  ...(parameters.ownerPassword
    ? { ownerPassword: parameters.ownerPassword }
    : {}),
  preventAssembly: parameters.preventAssembly ?? false,
  preventExtractContent: parameters.preventExtractContent ?? false,
  preventExtractForAccessibility:
    parameters.preventExtractForAccessibility ?? false,
  preventFillInForm: parameters.preventFillInForm ?? false,
  preventModify: parameters.preventModify ?? false,
  preventModifyAnnotations: parameters.preventModifyAnnotations ?? false,
  preventPrinting: parameters.preventPrinting ?? false,
  preventPrintingFaithful: parameters.preventPrintingFaithful ?? false,
});

// Reconstruct the tool's UI parameters from an add-password request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const changePermissionsFromApiParams = (
  apiParams: AddPasswordApiParams,
): Partial<ChangePermissionsParameters> => ({
  ...(apiParams.ownerPassword
    ? { ownerPassword: apiParams.ownerPassword }
    : {}),
  preventAssembly:
    apiParams.preventAssembly ?? defaultParameters.preventAssembly,
  preventExtractContent:
    apiParams.preventExtractContent ?? defaultParameters.preventExtractContent,
  preventExtractForAccessibility:
    apiParams.preventExtractForAccessibility ??
    defaultParameters.preventExtractForAccessibility,
  preventFillInForm:
    apiParams.preventFillInForm ?? defaultParameters.preventFillInForm,
  preventModify: apiParams.preventModify ?? defaultParameters.preventModify,
  preventModifyAnnotations:
    apiParams.preventModifyAnnotations ??
    defaultParameters.preventModifyAnnotations,
  preventPrinting:
    apiParams.preventPrinting ?? defaultParameters.preventPrinting,
  preventPrintingFaithful:
    apiParams.preventPrintingFaithful ??
    defaultParameters.preventPrintingFaithful,
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
export const changePermissionsOperationConfig = defineSingleFileTool({
  validateParams: validateChangePermissionsParameters,
  buildFormData: buildChangePermissionsFormData,
  toApiParams: changePermissionsToApiParams,
  fromApiParams: changePermissionsFromApiParams,
  operationType: "changePermissions",
  endpoint: ENDPOINT, // Change Permissions is a fake endpoint for the Add Password tool
  defaultParameters,
  // Both tools post to add-password. A permissions-only step carries none of the encryption
  // fields, so it is this tool and not Add Password; keyLength, always sent by Add Password,
  // is the reliable tell even when a password happens to be blank.
  claimsStoredStep: (apiParams) =>
    !("password" in apiParams) && !("keyLength" in apiParams),
});

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
