import { useTranslation } from "react-i18next";
import { useConnectedServer } from "@app/hooks/useConnectedServer";

/** Desktop: folder processing runs on the connected server, so it waits for one. Fails closed
 *  while the connection resolves, or the Downloads offer probes the bundled backend for nothing. */
export function useServerProcessingBlock(): string | null {
  const { t } = useTranslation();
  if (useConnectedServer()) return null;
  return t(
    "filesPage.processing.blockedNeedsConnection",
    "Sign in to Stirling Cloud or connect a self-hosted server to process folders.",
  );
}
