import apiClient from "@app/services/apiClient";
import {
  useToolOperation,
  ToolType,
  type CustomToolOperationConfig,
} from "@app/hooks/tools/shared/useToolOperation";
import { processResponse } from "@app/utils/toolResponseProcessor";

export interface UrlToPdfParameters {
  urlInput: string;
}

export function isValidWebUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const urlToPdfOperationConfig: CustomToolOperationConfig<UrlToPdfParameters> =
  {
    operationType: "urlToPdf",
    toolType: ToolType.custom,
    requiresFiles: false,
    endpoint: "/api/v1/convert/url/pdf",
    customProcessor: async ({ urlInput }) => {
      if (!isValidWebUrl(urlInput))
        throw new Error("Enter a valid HTTP or HTTPS URL.");
      const formData = new FormData();
      formData.append("urlInput", urlInput.trim());
      const response = await apiClient.post<Blob>(
        "/api/v1/convert/url/pdf",
        formData,
        {
          responseType: "blob",
        },
      );
      // The legacy endpoint redirects to an HTML error page for invalid/disabled URLs.
      if (response.data.type.split(";")[0] !== "application/pdf") {
        throw new Error("The URL could not be converted to a PDF.");
      }
      return {
        files: await processResponse(
          response.data,
          [],
          "",
          undefined,
          response.headers,
        ),
      };
    },
  };

export const useUrlToPdfOperation = () =>
  useToolOperation(urlToPdfOperationConfig);
