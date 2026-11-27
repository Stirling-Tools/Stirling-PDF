import { queryOptions } from "@tanstack/react-query";
import apiClient from "@editor/services/apiClient";
import { qk } from "@editor/query/keys";
import { CONFIG_STALE_TIME } from "@editor/query/staleTime";
import { getAutoOcrLanguage } from "@editor/utils/languageMapping";

export const OCR_LANGUAGES_ENDPOINT = "/api/v1/ui-data/ocr-pdf";

/** The OCR language codes the server has installed, as `endpoint` lists them. */
export function ocrLanguagesQuery(endpoint: string = OCR_LANGUAGES_ENDPOINT) {
  return queryOptions({
    queryKey: qk.ocrLanguages(endpoint),
    queryFn: async () => {
      const { data } = await apiClient.get<{ languages: string[] }>(endpoint, {
        suppressErrorToast: true,
      });
      return data.languages;
    },
    staleTime: CONFIG_STALE_TIME,
  });
}

/** The installed OCR language matching the UI language, or undefined when the server lacks it. */
export function autoOcrLanguage(
  available: readonly string[],
  uiLanguage: string,
): string | undefined {
  return getAutoOcrLanguage(uiLanguage).find((code) =>
    available.includes(code),
  );
}
