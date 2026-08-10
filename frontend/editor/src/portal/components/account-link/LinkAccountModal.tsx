import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import SupabaseLoginForm from "@app/auth/ui/SupabaseLoginForm";
import {
  useSupabaseLogin,
  type SupabaseLoginSession,
} from "@app/auth/ui/useSupabaseLogin";
import "@app/auth/ui/auth-theme.css";
import {
  ensureSaasSupabase,
  isSaasSupabaseConfigured,
  PENDING_LINK_KEY,
  SAAS_OAUTH_PROVIDERS,
} from "@portal/auth/saasSupabase";
import { PairingPanel } from "@portal/components/account-link/PairingPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * "link" pairs this instance to a Stirling team with a device-grant code;
   * "reauth" only refreshes an expired SaaS session for attended reads (the
   * instance stays linked), which still needs an in-browser sign-in because it
   * is a browser session we are renewing, not a server credential.
   */
  mode?: "link" | "reauth";
  /**
   * Called once the instance is linked. Carries the refreshed SaaS session on the
   * reauth path; pairing produces no browser session, so it is called with no
   * argument there.
   */
  onLinked: (session?: SupabaseLoginSession) => void | Promise<void>;
}

/**
 * Connect this server to a Stirling account.
 *
 * <p>Linking uses a pairing code (device grant): the server displays a short code
 * and the admin approves it on the Stirling site from any device. That indirection
 * is not decoration. A self-hosted instance runs on an origin the identity
 * provider will never have on its redirect allow-list, so an in-browser sign-in
 * here cannot complete SSO or a sign-up confirmation. Moving the human half of
 * the flow to our own origin is the only thing that makes those work, and it also
 * covers servers with no browser at all.
 *
 * <p>Re-auth is the exception and keeps the in-browser Supabase login: there we
 * genuinely want a session in this browser, and the admin already has an account.
 */
export function LinkAccountModal({
  open,
  onClose,
  mode = "link",
  onLinked,
}: Props) {
  const { t } = useTranslation();
  const reauth = mode === "reauth";

  useEffect(() => {
    if (open && reauth) ensureSaasSupabase();
  }, [open, reauth]);

  const login = useSupabaseLogin({
    providers: SAAS_OAUTH_PROVIDERS,
    redirectTo: window.location.href,
    onBeforeOAuth: () => sessionStorage.setItem(PENDING_LINK_KEY, mode),
    onSuccess: async (session) => {
      await onLinked(session);
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title={
        reauth
          ? t("portal.accountLink.modal.reauthTitle", "Sign in again")
          : t("portal.accountLink.modal.pairTitle", "Pair this server")
      }
      subtitle={
        reauth
          ? t(
              "portal.accountLink.modal.reauthSubtitle",
              "Your session expired. Sign back in to your Stirling account; this server stays linked.",
            )
          : t(
              "portal.accountLink.modal.pairSubtitle",
              "Connect this server to your Stirling account to unlock teams, the processor, pipelines and policies.",
            )
      }
    >
      {!reauth ? (
        <PairingPanel
          active={open}
          onLinked={() => {
            void onLinked();
            onClose();
          }}
        />
      ) : isSaasSupabaseConfigured ? (
        <SupabaseLoginForm state={login} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
              "to enable in-app sign-in against the hosted Stirling account.",
            )}
          </Banner>
          {import.meta.env.DEV && (
            <Button
              variant="secondary"
              onClick={async () => {
                await onLinked({ access_token: "dev-stub-jwt" });
                onClose();
              }}
            >
              {t(
                "portal.accountLink.modal.simulateSignIn",
                "Simulate sign-in (dev)",
              )}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
