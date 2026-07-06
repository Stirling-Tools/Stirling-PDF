import { useTranslation } from "react-i18next";
import {
  ToolType,
  useToolOperation,
  defineSingleFileTool,
} from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  RemovePasswordParameters,
  defaultParameters,
} from "@app/hooks/tools/removePassword/useRemovePasswordParameters";
import {
  buildRemovePasswordFormData,
  removePasswordToApiParams,
  removePasswordFromApiParams,
  REMOVE_PASSWORD_ENDPOINT,
} from "@app/hooks/tools/removePassword/buildRemovePasswordFormData";

// Re-export for backwards compatibility with any other imports
export { buildRemovePasswordFormData };

// Static configuration object
export const removePasswordOperationConfig = defineSingleFileTool({
  toolType: ToolType.singleFile,
  buildFormData: buildRemovePasswordFormData,
  toApiParams: removePasswordToApiParams,
  fromApiParams: removePasswordFromApiParams,
  operationType: "removePassword",
  endpoint: REMOVE_PASSWORD_ENDPOINT,
  defaultParameters,
});

export const useRemovePasswordOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemovePasswordParameters>({
    ...removePasswordOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "removePassword.error.failed",
        "An error occurred while removing the password from the PDF.",
      ),
    ),
  });
};
