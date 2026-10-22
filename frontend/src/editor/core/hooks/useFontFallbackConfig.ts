import { useEffect, useMemo, useState } from "react";
import { getLocalFontFallbackConfig } from "@app/services/pdfiumFontFallback";
import { subscribeToFontBaseUrl } from "@app/services/fontBaseUrl";

/**
 * PDFium fallback-font configuration, recomputed when the font base URL changes.
 * The desktop webview only learns the backend port after startup, so a config
 * memoized at mount would keep an empty base URL; `subscribeToFontBaseUrl` is a
 * no-op in the web build, where the base is known immediately.
 */
export function useFontFallbackConfig() {
  const [revision, setRevision] = useState(0);

  useEffect(
    () => subscribeToFontBaseUrl(() => setRevision((current) => current + 1)),
    [],
  );

  return useMemo(() => getLocalFontFallbackConfig(), [revision]);
}
