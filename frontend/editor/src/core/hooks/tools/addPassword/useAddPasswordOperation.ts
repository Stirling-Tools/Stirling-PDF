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
  AddPasswordFullParameters,
  defaultParameters,
} from "@app/hooks/tools/addPassword/useAddPasswordParameters";
import { defaultParameters as permissionsDefaults } from "@app/hooks/tools/changePermissions/useChangePermissionsParameters";

const ENDPOINT = "/api/v1/security/add-password" satisfies ToolEndpoint;
type AddPasswordApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the add-password request body. The
// permissions sub-object is flattened into the request's prevent* fields.
export const addPasswordToApiParams = (
  parameters: AddPasswordFullParameters,
): AddPasswordApiParams => ({
  password: parameters.password,
  ownerPassword: parameters.ownerPassword,
  keyLength: parameters.keyLength as AddPasswordApiParams["keyLength"],
  preventAssembly: parameters.permissions.preventAssembly ?? false,
  preventExtractContent: parameters.permissions.preventExtractContent ?? false,
  preventExtractForAccessibility:
    parameters.permissions.preventExtractForAccessibility ?? false,
  preventFillInForm: parameters.permissions.preventFillInForm ?? false,
  preventModify: parameters.permissions.preventModify ?? false,
  preventModifyAnnotations:
    parameters.permissions.preventModifyAnnotations ?? false,
  preventPrinting: parameters.permissions.preventPrinting ?? false,
  preventPrintingFaithful:
    parameters.permissions.preventPrintingFaithful ?? false,
});

// Reconstruct the tool's UI parameters from an add-password request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const addPasswordFromApiParams = (
  apiParams: AddPasswordApiParams,
): Partial<AddPasswordFullParameters> => ({
  password: apiParams.password ?? "",
  ownerPassword: apiParams.ownerPassword ?? "",
  keyLength: apiParams.keyLength,
  permissions: {
    preventAssembly: apiParams.preventAssembly ?? false,
    preventExtractContent: apiParams.preventExtractContent ?? false,
    preventExtractForAccessibility:
      apiParams.preventExtractForAccessibility ?? false,
    preventFillInForm: apiParams.preventFillInForm ?? false,
    preventModify: apiParams.preventModify ?? false,
    preventModifyAnnotations: apiParams.preventModifyAnnotations ?? false,
    preventPrinting: apiParams.preventPrinting ?? false,
    preventPrintingFaithful: apiParams.preventPrintingFaithful ?? false,
  },
});

// Static function that can be used by both the hook and automation executor
export const buildAddPasswordFormData = (
  parameters: AddPasswordFullParameters,
  file: File,
): FormData =>
  objectToFormData(addPasswordToApiParams(parameters), { fileInput: file });

// Full default parameters including permissions for automation
const fullDefaultParameters: AddPasswordFullParameters = {
  ...defaultParameters,
  permissions: permissionsDefaults,
};

// Static configuration object
export const addPasswordOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildAddPasswordFormData,
  toApiParams: addPasswordToApiParams,
  fromApiParams: addPasswordFromApiParams,
  operationType: "addPassword",
  endpoint: ENDPOINT,
  defaultParameters: fullDefaultParameters,
} as const;

export const useAddPasswordOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddPasswordFullParameters>({
    ...addPasswordOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "addPassword.error.failed",
        "An error occurred while encrypting the PDF.",
      ),
    ),
  });
};
