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
  RemoveCertificateSignParameters,
  defaultParameters,
} from "@app/hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";

const ENDPOINT = "/api/v1/security/remove-cert-sign" satisfies ToolEndpoint;

type RemoveCertificateSignApiParams = ToolApiParams[typeof ENDPOINT];

const toApiParams = (
  parameters: RemoveCertificateSignParameters,
): RemoveCertificateSignApiParams => ({
  removeVisibleSignature: parameters.removeVisibleSignature ?? false,
});

const fromApiParams = (
  parameters: RemoveCertificateSignApiParams,
): RemoveCertificateSignParameters => ({
  removeVisibleSignature: parameters.removeVisibleSignature ?? false,
});

export const buildRemoveCertificateSignFormData = (
  parameters: RemoveCertificateSignParameters,
  file: File,
): FormData => objectToFormData(toApiParams(parameters), { fileInput: file });

// Static configuration object
export const removeCertificateSignOperationConfig = defineSingleFileTool({
  buildFormData: buildRemoveCertificateSignFormData,
  toApiParams,
  fromApiParams,
  operationType: "removeCertSign",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useRemoveCertificateSignOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<RemoveCertificateSignParameters>({
    ...removeCertificateSignOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "removeCertSign.error.failed",
        "An error occurred while removing certificate signatures.",
      ),
    ),
  });
};
