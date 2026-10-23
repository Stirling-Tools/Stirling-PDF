import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@editor/hooks/tools/shared/useToolOperation";
import {
  fileOnlyMapping,
  objectToFormData,
  type ToolEndpoint,
} from "@editor/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@editor/utils/toolErrorHandler";
import {
  RemoveCertificateSignParameters,
  defaultParameters,
} from "@editor/hooks/tools/removeCertificateSign/useRemoveCertificateSignParameters";

const ENDPOINT = "/api/v1/security/remove-cert-sign" satisfies ToolEndpoint;

// Removing certificate signatures takes only a file; no parameters to map.
const { toApiParams, fromApiParams } = fileOnlyMapping();

export const buildRemoveCertificateSignFormData = (
  _parameters: RemoveCertificateSignParameters,
  file: File,
): FormData => objectToFormData(toApiParams(), { fileInput: file });

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
