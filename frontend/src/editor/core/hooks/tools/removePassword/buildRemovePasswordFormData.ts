import {
  RemovePasswordParameters,
  defaultParameters,
} from "@app/hooks/tools/removePassword/useRemovePasswordParameters";
import {
  objectToFormData,
  type ToolApiParams,
} from "@app/hooks/tools/shared/toolApiMapping";
import { REMOVE_PASSWORD_ENDPOINT } from "@app/constants/toolEndpoints";

export { REMOVE_PASSWORD_ENDPOINT };
type RemovePasswordApiParams = ToolApiParams[typeof REMOVE_PASSWORD_ENDPOINT];

// Convert the tool's UI parameters into the remove-password request body. The
// return type is the generated backend model, so a spec change that renames or
// drops a field breaks the build here.
export const removePasswordToApiParams = (
  parameters: RemovePasswordParameters,
): RemovePasswordApiParams => ({
  password: parameters.password,
});

// Reconstruct the tool's UI parameters from a remove-password request body, so a
// stored or AI-authored step can be re-rendered in the settings UI.
export const removePasswordFromApiParams = (
  apiParams: RemovePasswordApiParams,
): Partial<RemovePasswordParameters> => ({
  password: apiParams.password ?? defaultParameters.password,
});

/**
 * Builds FormData for remove password API request.
 * Separated from operation config to avoid circular dependencies with FileContext.
 */
export const buildRemovePasswordFormData = (
  parameters: RemovePasswordParameters,
  file: File,
): FormData =>
  objectToFormData(removePasswordToApiParams(parameters), { fileInput: file });
