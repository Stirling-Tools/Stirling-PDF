import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@shared/components";
import SupabaseLoginForm from "@shared/auth/ui/SupabaseLoginForm";
import {
  useSupabaseLogin,
  type SupabaseLoginSession,
} from "@shared/auth/ui/useSupabaseLogin";
import "@shared/auth/ui/auth-theme.css";
import {
  ensureSaasSupabase,
  isSaasSupabaseConfigured,
  PENDING_LINK_KEY,
  SAAS_OAUTH_PROVIDERS,
} from "@portal/auth/saasSupabase";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * "link" registers this instance against the signed-in account; "reauth" only
   * refreshes an expired SaaS session (the instance is already linked). The mode
   * is persisted across the OAuth redirect so the SSO-return handler doesn't
   * re-register on a reauth.
   */
  mode?: "link" | "reauth";
  /** Called with the SaaS session after a successful sign-in. */
  onLinked: (session: SupabaseLoginSession) => void | Promise<void>;
}

/**
 * In-app account-link login. Signs the admin in to their Stirling (SaaS) account
 * via the shared Supabase login (SSO + email/password), then hands the resulting
 * session to the caller to register this instance. No popup; the device secret
 * never reaches the browser. SSO redirects away and is finished by useAccountLink
 * on return.
 */
export function LinkAccountModal({
  open,
  onClose,
  mode = "link",
  onLinked,
}: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    if (open) ensureSaasSupabase();
  }, [open]);

  const reauth = mode === "reauth";
  const login = useSupabaseLogin({
    providers: SAAS_OAUTH_PROVIDERS,
    // Return to the current page after SSO; the SSO-return handler in
    // useAccountLink reads the persisted mode so it links vs. only refreshes.
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
          ? t("accountLink.modal.reauthTitle")
          : t("accountLink.modal.linkTitle")
      }
      subtitle={
        reauth
          ? t("accountLink.modal.reauthSubtitle")
          : t("accountLink.modal.linkSubtitle")
      }
    >
      {isSaasSupabaseConfigured ? (
        <SupabaseLoginForm state={login} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Banner
            tone="neutral"
            title={t("accountLink.modal.loginNotConfigured.title")}
          >
            {t("accountLink.modal.loginNotConfigured.before")}{" "}
            <code>VITE_SAAS_SUPABASE_URL</code>{" "}
            {t("accountLink.modal.loginNotConfigured.and")}{" "}
            <code>VITE_SAAS_SUPABASE_ANON_KEY</code>{" "}
            {t("accountLink.modal.loginNotConfigured.after")}
          </Banner>
          {import.meta.env.DEV && (
            <Button
              variant="outline"
              onClick={async () => {
                await onLinked({ access_token: "dev-stub-jwt" });
                onClose();
              }}
            >
              {t("accountLink.modal.simulateSignIn")}
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
