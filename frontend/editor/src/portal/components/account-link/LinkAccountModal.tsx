import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Modal } from "@app/ui";
import { withBasePath } from "@app/constants/app";
import { startConnect, startReauth } from "@portal/api/link";
import { isSaasSupabaseConfigured } from "@portal/auth/saasSupabase";
import "@portal/components/account-link/LinkAccountModal.css";

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * "link" connects this server to a team for the first time; "reauth" only re-establishes the browser's Stirling session for a server that is already linked.
   */
  mode?: "link" | "reauth";
}

/** Sends the admin off to Stirling to connect this server. */
export function LinkAccountModal({ open, onClose, mode = "link" }: Props) {
  const { t } = useTranslation();
  const reauth = mode === "reauth";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const callbackUrl = new URL(
        withBasePath("/account-link/callback"),
        window.location.origin,
      ).toString();
      const status = reauth
        ? await startReauth(callbackUrl)
        : await startConnect(window.location.hostname, callbackUrl);
      if (status.authorizeUrl) {
        window.location.assign(status.authorizeUrl);
        return;
      }
      // Already linked, or a handshake we cannot act on. Nothing to navigate to.
      setError(
        t(
          "portal.accountLink.modal.noAuthorizeUrl",
          "Stirling did not return somewhere to continue. Try again in a moment.",
        ),
      );
    } catch {
      setError(
        t(
          "portal.accountLink.modal.startFailed",
          "Could not reach Stirling to start the connection. Check this server's outbound network access, then try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [reauth, t]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title={
        reauth
          ? t("portal.accountLink.modal.reauthTitle", "Sign in again")
          : t(
              "portal.accountLink.modal.linkTitle",
              "Connect your Stirling account",
            )
      }
      subtitle={
        reauth
          ? t(
              "portal.accountLink.modal.reauthSubtitle",
              "Your Stirling session expired. Sign in again to keep seeing usage and billing. This server stays connected either way.",
            )
          : t(
              "portal.accountLink.modal.linkSubtitle",
              "Connect this server to the Stirling account it should bill against.",
            )
      }
    >
      <div className="portal-link__modal-body">
        <ol className="portal-link__steps">
          <li>
            {t(
              "portal.accountLink.modal.step1",
              "We send you to stirling.com to sign in. Any sign-in method works there, including Google and single sign-on.",
            )}
          </li>
          <li>
            {t(
              "portal.accountLink.modal.step2",
              "You check this server's address and approve it. A team owner has to do this the first time.",
            )}
          </li>
          <li>
            {t(
              "portal.accountLink.modal.step3",
              "Stirling brings you straight back here and finishes up.",
            )}
          </li>
        </ol>

        {!isSaasSupabaseConfigured && (
          <Banner
            tone="warning"
            title={t(
              "portal.accountLink.modal.loginNotConfigured.title",
              "Stirling connection not configured",
            )}
          >
            {t("portal.accountLink.modal.loginNotConfigured.before", "Set")}{" "}
            <code>VITE_SUPABASE_URL</code>{" "}
            {t("portal.accountLink.modal.loginNotConfigured.and", "and")}{" "}
            <code>VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY</code>{" "}
            {t(
              "portal.accountLink.modal.loginNotConfigured.after",
              "so this server can finish the connection when you come back.",
            )}
          </Banner>
        )}

        {error && <Banner tone="danger">{error}</Banner>}

        <div className="portal-link__modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("portal.accountLink.modal.cancel", "Cancel")}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void begin()}>
            {reauth
              ? t("portal.accountLink.modal.continueReauth", "Sign in again")
              : t(
                  "portal.accountLink.modal.continueLink",
                  "Continue to Stirling",
                )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
