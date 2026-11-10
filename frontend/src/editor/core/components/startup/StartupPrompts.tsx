import { useAuth } from "@editor/auth/UseSession";
import { useAppConfig } from "@editor/contexts/AppConfigContext";
import { StartupSetup } from "@editor/components/startup/StartupSetup";
import LoginAgreementModal from "@editor/components/shared/LoginAgreementModal";
import { useCookieConsentInitialization } from "@editor/hooks/useCookieConsentInitialization";
import { usePosthogTracking } from "@editor/hooks/usePosthogTracking";
import { useScarfTracking } from "@editor/hooks/useScarfTracking";

function StartupTracking() {
  useCookieConsentInitialization();
  usePosthogTracking();
  useScarfTracking();
  return null;
}

/** Mount once in each app's main routes, below its auth, config and theme providers. */
export function StartupPrompts() {
  const { config } = useAppConfig();
  const { user, loading, isAnonymous } = useAuth();

  if (!config || loading) {
    return null;
  }

  // A guest runs the tools but owns nothing, so there is no account setup, no
  // forced MFA and no password change to walk them through. The login agreement
  // still applies: an administrator may have asked for it in anonymous mode too.
  if (isAnonymous || (config.enableLogin !== false && !user)) {
    return (
      <LoginAgreementModal>
        <StartupTracking />
      </LoginAgreementModal>
    );
  }

  return (
    <StartupSetup key={user?.id ?? "anonymous"}>
      <LoginAgreementModal>
        <StartupTracking />
      </LoginAgreementModal>
    </StartupSetup>
  );
}
