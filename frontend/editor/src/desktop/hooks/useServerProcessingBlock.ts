import { useTranslation } from "react-i18next";
import { useConnectedServer } from "@app/hooks/useConnectedServer";

/**
 * Desktop: folder processing runs on the connected server, so it is unavailable until
 * the user signs in to one. Fails closed while the connection is still resolving —
 * the Downloads offer would otherwise fire a doomed probe at the bundled backend on
 * every launch.
 */
export function useServerProcessingBlock(): string | null {
  const { t } = useTranslation();
  if (useConnectedServer()) return null;
  return t(
    "filesPage.processing.blockedNeedsConnection",
    "Sign in to Stirling Cloud or connect a self-hosted server to process folders.",
  );
}
