import apiClient from "@editor/services/apiClient";
import { getAutoOcrLanguage } from "@editor/utils/languageMapping";

export const OCR_LANGUAGES_ENDPOINT = "/api/v1/ui-data/ocr-pdf";

/** The OCR language codes the server has installed, as `endpoint` lists them. */
export async function fetchOcrLanguages(
  endpoint: string = OCR_LANGUAGES_ENDPOINT,
): Promise<string[]> {
  const { data } = await apiClient.get<{ languages: string[] }>(endpoint);
  return data.languages;
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
