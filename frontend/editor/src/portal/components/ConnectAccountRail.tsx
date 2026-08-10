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

/**
 * The ambient connect prompt on portal Home, shown while the instance can link but has not.
 *
 * <p>Sits above the deployment rail rather than inside it: the deployment card answers "is this
 * server running", which stays true either way, while this answers "is it connected to an account",
 * which is the thing an admin has to act on.
 *
 * <p>Dismissal is session scoped on purpose. The ask is meant to come back until it is answered, so
 * nothing is persisted to localStorage; closing the tab clears it. Once linked the gate closes and
 * the rail disappears on its own.
 */
export function ConnectAccountRail() {
  const { t } = useTranslation();
  const { gated, loading, connect } = useConnectGate();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (loading || !gated || dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // A browser refusing session storage is not a reason to leave the rail stuck on screen.
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
            "Unlocks teams, the processor, pipelines and policies. Manual PDF editing stays free.",
          )}
        </span>
      </div>
      <div className="portal-connect-rail__actions">
        <Button variant="quiet" accent="neutral" onClick={dismiss}>
          {t("portal.accountLink.rail.later", "Later")}
        </Button>
        <Button variant="primary" onClick={connect}>
          {t("portal.accountLink.rail.cta", "Connect")}
        </Button>
      </div>
    </section>
  );
}
