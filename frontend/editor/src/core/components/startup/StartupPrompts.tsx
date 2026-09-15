import { useLocation } from "react-router-dom";
import { useAuth } from "@app/auth/UseSession";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { isStartupRoute } from "@app/constants/routes";
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

/** Mount once inside each app's auth, config and theme providers, outside editor tours. */
export function StartupPrompts() {
  const { pathname } = useLocation();
  const { config } = useAppConfig();
  const { user, loading } = useAuth();

  if (
    !isStartupRoute(pathname) ||
    !config ||
    loading ||
    (config.enableLogin !== false && !user)
  ) {
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
