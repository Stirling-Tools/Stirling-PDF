import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useOpenFeedback } from "@editor/hooks/useOpenFeedback";

/**
 * Opens feedback, or null when the server admin has turned feedback off or the
 * build has nowhere to send it. Null until the server config has loaded, so an
 * entry point never shows only to vanish.
 */
export function useFeedback(): (() => void) | null {
  const { config } = useAppConfig();
  const openFeedback = useOpenFeedback();
  return config?.enableFeedback === true ? openFeedback : null;
}
