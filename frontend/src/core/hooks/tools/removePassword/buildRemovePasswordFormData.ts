import { RemovePasswordParameters } from '@app/hooks/tools/removePassword/useRemovePasswordParameters';

/**
 * Builds FormData for remove password API request.
 * Separated from operation config to avoid circular dependencies with FileContext.
 */
export const buildRemovePasswordFormData = (parameters: RemovePasswordParameters, file: File): FormData => {
  const formData = new FormData();
  formData.append("fileInput", file);
  formData.append("password", parameters.password);
  return formData;
};
