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
  TimestampPdfParameters,
  defaultParameters,
} from "@app/hooks/tools/timestampPdf/useTimestampPdfParameters";

const ENDPOINT = "/api/v1/security/timestamp-pdf" satisfies ToolEndpoint;
type TimestampPdfApiParams = ToolApiParams[typeof ENDPOINT];

export const timestampPdfToApiParams = (
  parameters: TimestampPdfParameters,
): TimestampPdfApiParams => ({
  tsaUrl: parameters.tsaUrl,
});

export const timestampPdfFromApiParams = (
  apiParams: TimestampPdfApiParams,
): Partial<TimestampPdfParameters> => ({
  tsaUrl: apiParams.tsaUrl,
});

export const buildTimestampPdfFormData = (
  parameters: TimestampPdfParameters,
  file: File,
): FormData =>
  objectToFormData(timestampPdfToApiParams(parameters), { fileInput: file });

export const timestampPdfOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildTimestampPdfFormData,
  toApiParams: timestampPdfToApiParams,
  fromApiParams: timestampPdfFromApiParams,
  operationType: "timestampPdf",
  endpoint: ENDPOINT,
  multiFileEndpoint: false,
  defaultParameters,
} as const;

export const useTimestampPdfOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<TimestampPdfParameters>({
    ...timestampPdfOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "timestampPdf.error.failed",
        "An error occurred while timestamping the PDF.",
      ),
    ),
  });
};
