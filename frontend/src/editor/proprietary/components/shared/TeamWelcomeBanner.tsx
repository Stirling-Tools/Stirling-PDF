import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppBanner } from "@editor/components/shared/AppBanner";
import {
  dismissTeamWelcome,
  takeTeamWelcome,
} from "@editor/billing/teamWelcome";

/** One-time prompt after buying Team: the editor is where the buyer lands, and inviting is the next step. */
export function TeamWelcomeBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);

  // The banner slot lives for the whole session and the buyer arrives by client-side navigation,
  // so the mark is checked on every arrival, not only on mount.
  useEffect(() => {
    if (takeTeamWelcome()) setShow(true);
  }, [pathname]);

  if (!show) return null;

  const close = () => {
    dismissTeamWelcome();
    setShow(false);
  };

  return (
    <AppBanner
      tone="promo"
      icon="users"
      title={t("teamWelcome.title", "You're on Team.")}
      message={t(
        "teamWelcome.message",
        "Invite your team so they can start working with you.",
      )}
      buttonText={t("teamWelcome.invite", "Invite people")}
      buttonIcon="user-plus"
      onButtonClick={() => {
        close();
        navigate("/settings/people");
      }}
      onDismiss={close}
    />
  );
}
