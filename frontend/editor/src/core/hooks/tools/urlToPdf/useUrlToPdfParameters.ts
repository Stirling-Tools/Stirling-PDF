import { BaseParameters } from "@app/types/parameters";
import {
  useBaseParameters,
  BaseParametersHook,
} from "@app/hooks/tools/shared/useBaseParameters";

export interface UrlToPdfParameters extends BaseParameters {
  urlInput: string;
}

export const defaultParameters: UrlToPdfParameters = {
  urlInput: "",
};

export const isSupportedUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  return (
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    parsed.hostname.length > 0
  );
};

export const validateUrlToPdfParameters = (
  parameters: UrlToPdfParameters,
): boolean => isSupportedUrl(parameters.urlInput);

export type UrlToPdfParametersHook = BaseParametersHook<UrlToPdfParameters>;

export const useUrlToPdfParameters = (): UrlToPdfParametersHook =>
  useBaseParameters({
    defaultParameters,
    endpointName: "url-to-pdf",
    validateFn: validateUrlToPdfParameters,
  });
