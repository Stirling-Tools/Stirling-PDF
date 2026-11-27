import { useTranslation } from "react-i18next";
import {
  useToolOperation,
  defineSingleFileTool,
} from "@editor/hooks/tools/shared/useToolOperation";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@editor/hooks/tools/shared/toolApiMapping";
import { createStandardErrorHandler } from "@editor/utils/toolErrorHandler";
import {
  ArchivePdfParameters,
  PdfaOutputFormat,
  defaultParameters,
  isPdfaOutputFormat,
} from "@editor/hooks/tools/archivePdf/useArchivePdfParameters";

const ENDPOINT = "/api/v1/convert/pdf/pdfa" satisfies ToolEndpoint;
type PdfaApiParams = ToolApiParams[typeof ENDPOINT];

/** The backend's shorthand names for the profiles this tool offers. */
const OUTPUT_FORMAT_ALIASES: Partial<
  Record<PdfaApiParams["outputFormat"], PdfaOutputFormat>
> = {
  pdfa: "pdfa-2b",
  "pdfa-2": "pdfa-2b",
  "pdfa-3": "pdfa-3b",
};

function toOutputFormat(value: PdfaApiParams["outputFormat"] | undefined) {
  if (isPdfaOutputFormat(value)) return value;
  return (
    (value && OUTPUT_FORMAT_ALIASES[value]) ?? defaultParameters.outputFormat
  );
}

export const archivePdfToApiParams = (
  parameters: ArchivePdfParameters,
): PdfaApiParams => ({
  outputFormat: parameters.outputFormat,
  strict: parameters.strict,
});

export const archivePdfFromApiParams = (
  apiParams: PdfaApiParams,
): Partial<ArchivePdfParameters> => ({
  outputFormat: toOutputFormat(apiParams.outputFormat),
  // Steps saved from Convert hold their form fields as strings.
  strict: String(apiParams.strict) === "true",
});

export const buildArchivePdfFormData = (
  parameters: ArchivePdfParameters,
  file: File,
): FormData =>
  objectToFormData(archivePdfToApiParams(parameters), { fileInput: file });

export const archivePdfOperationConfig = defineSingleFileTool({
  buildFormData: buildArchivePdfFormData,
  toApiParams: archivePdfToApiParams,
  fromApiParams: archivePdfFromApiParams,
  // PDF/X shares this endpoint but stays with Convert. Convert saves "pdfx-3",
  // and the backend reads any "pdfx" prefix as PDF/X.
  claimsStoredStep: (apiParams) =>
    !String(apiParams.outputFormat).toLowerCase().startsWith("pdfx"),
  operationType: "archivePdf",
  endpoint: ENDPOINT,
  defaultParameters,
});

export const useArchivePdfOperation = () => {
  const { t } = useTranslation();

  return useToolOperation<ArchivePdfParameters>({
    ...archivePdfOperationConfig,
    getErrorMessage: createStandardErrorHandler(
      t(
        "archivePdf.error.failed",
        "An error occurred while converting the PDF to PDF/A.",
      ),
    ),
  });
};
