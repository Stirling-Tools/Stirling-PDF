import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import "@portal/components/ConnectAccountRail.css";

const DISMISSED_KEY = "portal::connect-rail-dismissed";

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Session-scoped dismissal, so the ask comes back until it is answered rather than for good. */
export function ConnectAccountRail() {
  const { t } = useTranslation();
  const { gated, loading, connect } = useConnectGate();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (loading || !gated || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // Storage refusing is no reason to leave the rail stuck on screen.
    }
    setDismissed(true);
  };

  return (
    <section className="portal-connect-rail">
      <div className="portal-connect-rail__text">
        <b className="portal-connect-rail__title">
          {t("portal.accountLink.rail.title", "Connect your Stirling account")}
        </b>
        <span className="portal-connect-rail__sub">
          {t(
            "portal.accountLink.rail.sub",
            "Unlocks teams, PDF processor, pipelines, and policies. PDF editing stays free.",
          )}
        </span>
      </div>
      <div className="portal-connect-rail__actions">
        <Button variant="quiet" accent="neutral" onClick={dismiss}>
          {t("portal.accountLink.rail.later", "Not now")}
        </Button>
        <Button variant="primary" onClick={connect}>
          {t("portal.accountLink.rail.cta", "Connect")}
        </Button>
      </div>
    </section>
  );
}
