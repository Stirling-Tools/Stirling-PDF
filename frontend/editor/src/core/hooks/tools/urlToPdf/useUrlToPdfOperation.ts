import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import apiClient from "@app/services/apiClient";
import { createFileFromApiResponse } from "@app/utils/fileResponseUtils";
import {
  useToolOperation,
  defineCustomTool,
  CustomProcessorResult,
} from "@app/hooks/tools/shared/useToolOperation";
import { createStandardErrorHandler } from "@app/utils/toolErrorHandler";
import {
  objectToFormData,
  type ToolApiParams,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import {
  UrlToPdfParameters,
  defaultParameters,
  validateUrlToPdfParameters,
} from "@app/hooks/tools/urlToPdf/useUrlToPdfParameters";

const ENDPOINT = "/api/v1/convert/url/pdf" satisfies ToolEndpoint;

export const urlToPdfToApiParams = (
  parameters: UrlToPdfParameters,
): ToolApiParams[typeof ENDPOINT] => ({
  urlInput: parameters.urlInput.trim(),
});

export const urlToPdfFromApiParams = (
  apiParams: ToolApiParams[typeof ENDPOINT],
): Partial<UrlToPdfParameters> => ({ urlInput: apiParams.urlInput ?? "" });

export interface UrlToPdfMessages {
  notAPdf: string;
  endpointDisabled: string;
  invalidUrlFormat: string;
  urlNotReachable: string;
  disallowedUrlContent: string;
}

const DEFAULT_MESSAGES: UrlToPdfMessages = {
  notAPdf: "The server did not return a PDF for that address.",
  endpointDisabled: "URL to PDF is disabled on this server.",
  invalidUrlFormat: "That does not look like a valid web address.",
  urlNotReachable: "The server could not reach that address.",
  disallowedUrlContent:
    "That page references content this server will not fetch.",
};

const REJECTION_CODES: Record<string, keyof UrlToPdfMessages> = {
  "error.endpointDisabled": "endpointDisabled",
  "error.invalidUrlFormat": "invalidUrlFormat",
  "error.urlNotReachable": "urlNotReachable",
  "error.disallowedUrlContent": "disallowedUrlContent",
};

const fallbackFilename = (url: string): string => {
  try {
    const { hostname } = new URL(url.trim());
    return `${hostname.replace(/^www\./, "") || "page"}.pdf`;
  } catch {
    return "page.pdf";
  }
};

const rejectionMessage = (
  response: { request?: unknown },
  messages: UrlToPdfMessages,
): string | null => {
  const finalUrl = (response.request as { responseURL?: string } | undefined)
    ?.responseURL;
  if (!finalUrl) return null;
  let code: string | null;
  try {
    code = new URL(finalUrl, "http://localhost").searchParams.get("error");
  } catch {
    return null;
  }
  if (!code) return null;
  const key = REJECTION_CODES[code];
  return key ? messages[key] : messages.notAPdf;
};

export const convertUrlToPdf = async (
  parameters: UrlToPdfParameters,
  messages: UrlToPdfMessages = DEFAULT_MESSAGES,
): Promise<CustomProcessorResult> => {
  const response = await apiClient.post(
    ENDPOINT,
    objectToFormData(urlToPdfToApiParams(parameters)),
    { responseType: "blob" },
  );

  const contentType = String(response.headers?.["content-type"] ?? "");
  if (!contentType.includes("application/pdf")) {
    throw new Error(rejectionMessage(response, messages) ?? messages.notAPdf);
  }

  return {
    files: [
      createFileFromApiResponse(
        response.data,
        response.headers,
        fallbackFilename(parameters.urlInput),
      ),
    ],
  };
};

export const urlToPdfOperationConfig = defineCustomTool<UrlToPdfParameters>({
  customProcessor: (parameters) => convertUrlToPdf(parameters),
  operationType: "urlToPdf",
  endpoint: ENDPOINT,
  defaultParameters,
  validateParams: validateUrlToPdfParameters,
  toApiParams: urlToPdfToApiParams,
  fromApiParams: urlToPdfFromApiParams,
  runsWithoutInputFiles: true,
});

export const useUrlToPdfOperation = () => {
  const { t } = useTranslation();

  const customProcessor = useCallback(
    (parameters: UrlToPdfParameters) =>
      convertUrlToPdf(parameters, {
        notAPdf: t("urlToPdf.error.notAPdf", DEFAULT_MESSAGES.notAPdf),
        endpointDisabled: t(
          "urlToPdf.error.endpointDisabled",
          DEFAULT_MESSAGES.endpointDisabled,
        ),
        invalidUrlFormat: t(
          "urlToPdf.error.invalidUrlFormat",
          DEFAULT_MESSAGES.invalidUrlFormat,
        ),
        urlNotReachable: t(
          "urlToPdf.error.urlNotReachable",
          DEFAULT_MESSAGES.urlNotReachable,
        ),
        disallowedUrlContent: t(
          "urlToPdf.error.disallowedUrlContent",
          DEFAULT_MESSAGES.disallowedUrlContent,
        ),
      }),
    [t],
  );

  return useToolOperation<UrlToPdfParameters>({
    ...urlToPdfOperationConfig,
    customProcessor,
    getErrorMessage: createStandardErrorHandler(
      t("urlToPdf.error.failed", "An error occurred while converting the URL."),
    ),
  });
};
