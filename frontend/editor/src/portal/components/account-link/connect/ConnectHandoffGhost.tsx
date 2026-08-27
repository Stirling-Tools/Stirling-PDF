import { useTranslation } from "react-i18next";
import { Skeleton } from "@app/ui";
import "@portal/components/account-link/connect/connect.css";

/**
 * Step 2 of the connect flow: the browser is on its way to Stirling.
 *
 * <p>A ghost rather than a screen, because the admin has already decided by this point. It earns
 * its place when the instance's own backend is slow to open the handshake, which is when a blank
 * dialog would look broken.
 *
 * <p>No error state: a failed hand-off drops back to step 1, which is where the reason is shown.
 */
export function ConnectHandoffGhost() {
  const { t } = useTranslation();

  return (
    <div className="portal-connect__ghost">
      <p className="portal-connect__lede">
        {t(
          "portal.accountLink.connect.handoff.going",
          "Taking you to stirling.com",
        )}
      </p>

      <div className="portal-connect__ghost-bars" aria-hidden>
        <Skeleton height="2.25rem" />
        <Skeleton height="2.25rem" width="80%" />
        <Skeleton height="2.25rem" width="55%" />
      </div>
    </div>
  );
}
