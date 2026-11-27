import { useQuery } from "@tanstack/react-query";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useMultipleEndpointsEnabled } from "@editor/hooks/useEndpointConfig";
import { ocrLanguagesQuery } from "@editor/hooks/tools/ocr/ocrLanguages";

const OCR_ENDPOINTS = ["ocr-pdf"];

/**
 * Loads the server's OCR languages at app start, so an OCR step added in Automate gets its language
 * without waiting on the server. Waits for the server's own config, since before sign-in the request
 * would only be refused. Renders nothing; staying mounted keeps the list in the cache.
 */
export function OcrLanguagesPrefetch() {
  const { configFromServer } = useAppConfig();
  const { endpointStatus } = useMultipleEndpointsEnabled(OCR_ENDPOINTS);
  useQuery({
    ...ocrLanguagesQuery(),
    enabled: configFromServer && endpointStatus["ocr-pdf"] === true,
  });
  return null;
}
