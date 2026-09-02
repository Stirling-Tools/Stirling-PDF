import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui";
import { useConnectGate } from "@processor/hooks/useConnectGate";
import "@processor/components/ConnectAccountRail.css";

const DISMISSED_KEY = "processor::connect-rail-dismissed";

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
    <section className="processor-connect-rail">
      <div className="processor-connect-rail__text">
        <b className="processor-connect-rail__title">
          {t(
            "processor.accountLink.rail.title",
            "Connect your Stirling account",
          )}
        </b>
        <span className="processor-connect-rail__sub">
          {t(
            "processor.accountLink.rail.sub",
            "Unlocks teams, PDF processor, pipelines, and policies. PDF editing stays free.",
          )}
        </span>
      </div>
      <div className="processor-connect-rail__actions">
        <Button variant="quiet" accent="neutral" onClick={dismiss}>
          {t("processor.accountLink.rail.later", "Not now")}
        </Button>
        <Button variant="primary" onClick={connect}>
          {t("processor.accountLink.rail.cta", "Connect")}
        </Button>
      </div>
    </section>
  );
}
