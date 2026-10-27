import { useTranslation } from "react-i18next";
import type { StirlingFile } from "@editor/types/fileContext";
import { getPdfAccess } from "@editor/services/pdfAccessService";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@editor/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@editor/utils/toolErrorHandler";
import {
  validateRemovePasswordParameters,
  RemovePasswordParameters,
  defaultParameters,
} from "@editor/hooks/tools/removePassword/useRemovePasswordParameters";
import {
  buildRemovePasswordFormData,
  removePasswordToApiParams,
  removePasswordFromApiParams,
  REMOVE_PASSWORD_ENDPOINT,
} from "@editor/hooks/tools/removePassword/buildRemovePasswordFormData";

export const removePasswordOperationConfig = defineSingleFileTool({
  validateParams: validateRemovePasswordParameters,
  buildFormData: buildRemovePasswordFormData,
  toApiParams: removePasswordToApiParams,
  fromApiParams: removePasswordFromApiParams,
  operationType: "removePassword",
  endpoint: REMOVE_PASSWORD_ENDPOINT,
  defaultParameters,
});

// Only selective removal omits absent roles. Legacy automation and unprotected copies
// use the shared form builder's password as authentication, irrespective of its role.
function getRemovePasswordParametersForFile(
  parameters: RemovePasswordParameters,
  file: File,
): RemovePasswordParameters {
  const access = getPdfAccess(file);
  return {
    password:
      access?.encrypted === false || access?.requiresOpeningPassword === false
        ? ""
        : parameters.password,
    ownerPassword: access?.encrypted === false ? "" : parameters.ownerPassword,
  };
}

export const useRemovePasswordOperation = () => {
  const { t } = useTranslation();

  const operation = useToolOperation<RemovePasswordParameters>({
    ...removePasswordOperationConfig,
    buildFormData: (params: RemovePasswordParameters, file: File) =>
      buildRemovePasswordFormData(
        getRemovePasswordParametersForFile(params, file),
        file,
      ),
    getErrorMessage: createStandardErrorHandler(
      t(
        "removePassword.error.failed",
        "An error occurred while removing the password from the PDF.",
      ),
    ),
  });
  return {
    ...operation,
    executeOperation: (
      params: RemovePasswordParameters,
      files: StirlingFile[],
    ) =>
      operation.executeOperation(
        params,
        files.filter((file) =>
          validateRemovePasswordParameters(
            getRemovePasswordParametersForFile(params, file),
          ),
        ),
      ),
  };
};
