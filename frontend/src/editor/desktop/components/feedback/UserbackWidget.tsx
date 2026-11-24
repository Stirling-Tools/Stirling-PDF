import { useAuth } from "@editor/auth/UseSession";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { useSaasAppConfig } from "@editor/hooks/useSaasAppConfig";
import { useUserback } from "@editor/components/feedback/useUserback";

const USERBACK_TOKEN = import.meta.env.VITE_USERBACK_TOKEN;

/**
 * Loads Userback while signed in to SaaS with feedback on in both the SaaS and
 * the local config. Userback only loads on its project's whitelisted domains,
 * which must include the webview origins `tauri://localhost` and
 * `http://tauri.localhost`; elsewhere feedback opens the web page instead.
 */
export default function UserbackWidget() {
  const { user } = useAuth();
  const { config } = useAppConfig();
  const saasConfig = useSaasAppConfig();
  const feedbackEnabled =
    config?.enableFeedback === true && saasConfig?.enableFeedback === true;

  // A SaaS session without an email gets a shared fallback id, which would
  // merge everyone who has one into a single Userback user.
  useUserback(
    USERBACK_TOKEN,
    feedbackEnabled && user?.email
      ? { id: user.id, name: user.username, email: user.email }
      : null,
  );

  return null;
}
