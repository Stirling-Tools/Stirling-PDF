import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Spinner } from "@app/ui";
import { OPEN_SIGN_IN_EVENT } from "@app/constants/signInEvents";
import { useConnectionMode } from "@app/hooks/useConnectionMode";
import { usePortalAccessState } from "@app/hooks/usePortalAccess";
import "@app/portal/auth/PortalAuthBoundary.css";

/**
 * Desktop gate. The app already holds the session for the connected server, so
 * this adds no auth provider: it lets in an account with Processor access and
 * sends everyone else to the editor, asking a local-mode user to sign in.
 */
export function PortalAuthBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = useConnectionMode();
  const { granted, settled } = usePortalAccessState();
  const turnedAway = settled && !granted;

  useEffect(() => {
    if (!turnedAway) return;
    navigate("/", { replace: true });
    if (mode === "local") {
      window.dispatchEvent(
        new CustomEvent(OPEN_SIGN_IN_EVENT, { detail: { locked: false } }),
      );
    }
  }, [turnedAway, mode, navigate]);

  if (!granted) {
    return (
      <div className="desktop-processor-gate">
        <Spinner size="lg" label={t("portal.auth.loading", "Loading")} />
      </div>
    );
  }
  return <>{children}</>;
}
