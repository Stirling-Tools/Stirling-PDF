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
  AddAttachmentsParameters,
  DEFAULT_ADD_ATTACHMENTS_PARAMETERS,
} from "@app/hooks/tools/addAttachments/useAddAttachmentsParameters";

const ENDPOINT = "/api/v1/misc/add-attachments" satisfies ToolEndpoint;
type AddAttachmentsApiParams = ToolApiParams[typeof ENDPOINT];

// Convert the tool's UI parameters into the add-attachments request body. The
// attachment files are uploaded via the named "attachments" field (see
// buildFormData); the model lists them but they are not scalar parameters.
export const addAttachmentsToApiParams = (
  parameters: AddAttachmentsParameters,
): AddAttachmentsApiParams => ({
  attachments: [],
  convertToPdfA3b: parameters.convertToPdfA3b,
});

// Reconstruct the tool's UI parameters from an add-attachments request body (the
// attachment files themselves are not recoverable from stored parameters).
export const addAttachmentsFromApiParams = (
  apiParams: AddAttachmentsApiParams,
): Partial<AddAttachmentsParameters> => ({
  convertToPdfA3b:
    apiParams.convertToPdfA3b ??
    DEFAULT_ADD_ATTACHMENTS_PARAMETERS.convertToPdfA3b,
});

const buildFormData = (
  parameters: AddAttachmentsParameters,
  file: File,
): FormData =>
  objectToFormData(addAttachmentsToApiParams(parameters), {
    fileInput: file,
    attachments: (parameters.attachments || []).filter(Boolean),
  });

// Operation configuration for automation
export const addAttachmentsOperationConfig = defineSingleFileTool({
  buildFormData,
  toApiParams: addAttachmentsToApiParams,
  fromApiParams: addAttachmentsFromApiParams,
  operationType: "addAttachments",
  endpoint: ENDPOINT,
  defaultParameters: DEFAULT_ADD_ATTACHMENTS_PARAMETERS,
});

export const useAddAttachmentsOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<AddAttachmentsParameters>({
    ...addAttachmentsOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "addAttachments.error.failed",
        "An error occurred while adding attachments to the PDF.",
      ),
    ),
  });
};
