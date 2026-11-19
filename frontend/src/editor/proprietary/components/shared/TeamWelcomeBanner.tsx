import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppBanner } from "@editor/components/shared/AppBanner";
import { isTeamWelcome } from "@editor/billing/teamWelcome";

/** One-time prompt after buying Team: the editor is where the buyer lands, and inviting is the next step. */
export function TeamWelcomeBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname, search, hash, state } = useLocation();
  const [show, setShow] = useState(false);
  const welcomed = isTeamWelcome(state);

  // The banner slot outlives navigation, so the state is checked on every arrival. Clearing it
  // keeps a reload or a return to this history entry from showing the banner again.
  useEffect(() => {
    if (!welcomed) return;
    setShow(true);
    navigate({ pathname, search, hash }, { replace: true, state: null });
  }, [welcomed, navigate, pathname, search, hash]);

  if (!show) return null;

  const close = () => setShow(false);

  return (
    <AppBanner
      tone="promo"
      icon="users"
      title={t("teamWelcome.title", "Your Team plan is active.")}
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
