import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { StartupSetup } from "@app/components/startup/StartupSetup";
import LoginAgreementModal from "@app/components/shared/LoginAgreementModal";
import { useCookieConsentInitialization } from "@app/hooks/useCookieConsentInitialization";
import { usePosthogTracking } from "@app/hooks/usePosthogTracking";
import { useScarfTracking } from "@app/hooks/useScarfTracking";

function StartupTracking() {
  useCookieConsentInitialization();
  usePosthogTracking();
  useScarfTracking();
  return null;
}

/** Mount once in each app's main routes, below its auth, config and theme providers. */
export function StartupPrompts() {
  const { config } = useAppConfig();
  const { user, loading } = useAuth();

  if (!config || loading || (config.enableLogin !== false && !user)) {
    return null;
  }

  return (
    <StartupSetup key={user?.id ?? "anonymous"}>
      <LoginAgreementModal>
        <StartupTracking />
      </LoginAgreementModal>
    </StartupSetup>
  );
}
