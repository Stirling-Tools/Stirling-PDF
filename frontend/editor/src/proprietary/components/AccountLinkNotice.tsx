import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth";
import { Modal, Button } from "@app/ui";
import { alert, dismissToast } from "@app/components/toast";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import {
  acknowledgeAccountLinkPrompt,
  useAccountLinkBlock,
} from "@app/services/accountLinkBlock";

const NOTICE_ID = "server-free-credits-exhausted";

interface Props {
  /** Hosts without a Processor route open the connected server's billing page externally. */
  onShowOptions?: () => void;
}

/** Editor failures retain an actionable notice; the Processor owns the account-link handshake. */
export function AccountLinkNotice({ onShowOptions }: Props = {}) {
  const { t } = useTranslation();
  const { isAdmin, loading } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { exhausted, promptPending } = useAccountLinkBlock();
  const [open, setOpen] = useState(false);
  const hasLinkDialog =
    !onShowOptions &&
    (pathname === PORTAL_BASENAME ||
      pathname.startsWith(`${PORTAL_BASENAME}/`) ||
      pathname === "/settings/billing" ||
      pathname === "/settings/account-link");
  const title = t(
    "portal.accountLink.rail.exhaustedTitle",
    "This server’s free credits are used up",
  );
  const body = isAdmin
    ? t(
        "portal.accountLink.rail.exhaustedSub",
        "Link for monthly credits, shared billing and the option to grow with a Team plan.",
      )
    : t(
        "portal.accountLink.connect.adminRequired",
        "Ask your server administrator to open Usage & billing and link a Stirling account for more monthly credits. Manual PDF tools are still available.",
      );
  const cta = t("portal.accountLink.notice.options", "View linking options");

  const showOptions = useCallback(() => {
    setOpen(false);
    if (onShowOptions) {
      onShowOptions();
    } else {
      navigate(PORTAL_BASENAME, {
        state: { accountLinkPrompt: "exhausted" },
      });
    }
  }, [navigate, onShowOptions]);

  useEffect(() => {
    if (!exhausted || hasLinkDialog) setOpen(false);
  }, [exhausted, hasLinkDialog]);

  useEffect(() => {
    if (hasLinkDialog || loading || !promptPending) return;
    acknowledgeAccountLinkPrompt();
    setOpen(true);
  }, [hasLinkDialog, loading, promptPending]);

  useEffect(() => {
    if (hasLinkDialog || loading || !exhausted || open || promptPending) return;
    alert({
      id: NOTICE_ID,
      alertType: "neutral",
      title,
      body,
      isPersistentPopup: true,
      ...(isAdmin
        ? {
            buttonText: cta,
            buttonCallback: showOptions,
          }
        : {}),
    });
    return () => dismissToast(NOTICE_ID);
  }, [
    hasLinkDialog,
    loading,
    exhausted,
    open,
    promptPending,
    isAdmin,
    title,
    body,
    cta,
    showOptions,
  ]);

  return (
    <Modal
      open={open && exhausted && !hasLinkDialog}
      onClose={() => setOpen(false)}
      title={title}
      footer={
        <>
          <Button
            variant="quiet"
            accent="neutral"
            onClick={() => setOpen(false)}
          >
            {t("portal.accountLink.connect.notNow", "Not now")}
          </Button>
          {isAdmin && (
            <Button variant="primary" onClick={showOptions}>
              {cta}
            </Button>
          )}
        </>
      }
    >
      <p>{body}</p>
      {isAdmin && (
        <p>
          {t(
            "portal.accountLink.connect.manualTools",
            "Manual PDF tools are still available. Your local allowance renews automatically.",
          )}
        </p>
      )}
    </Modal>
  );
}
