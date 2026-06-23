import { useEffect } from "react";
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
export function LinkAccountModal({ open, onClose, onLinked }: Props) {
  useEffect(() => {
    if (open) ensureSaasSupabase();
  }, [open]);

  const login = useSupabaseLogin({
    providers: SAAS_OAUTH_PROVIDERS,
    // Return to the current page after SSO; the link finishes from useAccountLink.
    redirectTo: window.location.href,
    onBeforeOAuth: () => sessionStorage.setItem(PENDING_LINK_KEY, ""),
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
      title="Link your Stirling account"
      subtitle="Sign in to the account this server should bill against."
    >
      {isSaasSupabaseConfigured ? (
        <SupabaseLoginForm state={login} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Banner tone="neutral" title="SaaS login not configured">
            Set <code>VITE_SAAS_SUPABASE_URL</code> and{" "}
            <code>VITE_SAAS_SUPABASE_ANON_KEY</code> to enable in-app linking
            against the hosted Stirling account.
          </Banner>
          {import.meta.env.DEV && (
            <Button
              variant="outline"
              onClick={async () => {
                await onLinked({ access_token: "dev-stub-jwt" });
                onClose();
              }}
            >
              Simulate sign-in (dev)
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
