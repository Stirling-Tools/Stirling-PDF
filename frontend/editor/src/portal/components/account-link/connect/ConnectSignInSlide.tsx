import { useTranslation } from "react-i18next";
import { Banner, Button } from "@app/ui";
import SupabaseLoginForm from "@app/auth/ui/SupabaseLoginForm";
import type {
  SupabaseLoginSession,
  SupabaseLoginState,
} from "@app/auth/ui/useSupabaseLogin";
import "@app/auth/ui/auth-theme.css";
import { isSaasSupabaseConfigured } from "@portal/auth/saasSupabase";
import "@portal/components/account-link/connect/connect.css";

interface Props {
  /** Login state from useSupabaseLogin, owned by the host so it can react to success. */
  login: SupabaseLoginState;
  /** Failure from the link call itself, as opposed to a failed sign-in. */
  linkError?: string | null;
  /** Re-authenticating an already linked instance rather than linking a new one. */
  reauth?: boolean;
  /** Dev-only shortcut used when Supabase is unconfigured. */
  onSimulate?: (session: SupabaseLoginSession) => void | Promise<void>;
}

/**
 * Step 2 of the Connect flow: sign in to the Stirling account this server should run against.
 *
 * <p>This is the swappable step. Steps 1 and 3 are about value and activation and are independent
 * of how the credential is obtained, so a future pairing-code flow replaces this component and the
 * host's step-2 branch without touching them.
 *
 * <p>Sign-in reuses the shared {@link SupabaseLoginForm} rather than the SaaS login route
 * components, which are coupled to route state (next path, login-landing marker, logged-in state,
 * magic link) that has no meaning inside a dialog. OAuth appears only when the host supplies
 * providers; see {@code saasSupabase} for why that is normally empty on self-hosted.
 */
export function ConnectSignInSlide({
  login,
  linkError,
  reauth = false,
  onSimulate,
}: Props) {
  const { t } = useTranslation();

  if (!isSaasSupabaseConfigured) {
    return (
      <div className="portal-connect__stack">
        <Banner
          tone="neutral"
          title={t(
            "portal.accountLink.modal.loginNotConfigured.title",
            "SaaS login not configured",
          )}
        >
          {t("portal.accountLink.modal.loginNotConfigured.before", "Set")}{" "}
          <code>VITE_SUPABASE_URL</code>{" "}
          {t("portal.accountLink.modal.loginNotConfigured.and", "and")}{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</code>{" "}
          {t(
            "portal.accountLink.modal.loginNotConfigured.after",
            "to enable in-app linking against the hosted Stirling account.",
          )}
        </Banner>
        {import.meta.env.DEV && onSimulate && (
          <Button
            variant="secondary"
            onClick={() => void onSimulate({ access_token: "dev-stub-jwt" })}
          >
            {t(
              "portal.accountLink.modal.simulateSignIn",
              "Simulate sign-in (dev)",
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="portal-connect__stack">
      <p className="portal-connect__lede">
        {reauth
          ? t(
              "portal.accountLink.connect.signIn.reauthLede",
              "Your session expired. Sign back in to your Stirling account. This server stays connected.",
            )
          : t(
              "portal.accountLink.connect.signIn.lede",
              "Your credits and team live in your Stirling account. This server connects once, then runs on its own.",
            )}
      </p>

      {linkError && (
        <Banner
          tone="danger"
          title={t(
            "portal.accountLink.connect.signIn.failed",
            "Couldn't connect this server",
          )}
        >
          {linkError}
        </Banner>
      )}

      <SupabaseLoginForm state={login} />
    </div>
  );
}
