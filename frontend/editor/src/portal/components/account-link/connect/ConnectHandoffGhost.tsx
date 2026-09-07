import { useTranslation } from "react-i18next";
import { Skeleton } from "@app/ui";
import "@portal/components/account-link/connect/connect.css";

/**
 * A ghost rather than a screen: the admin has already decided. It earns its place when the local
 * backend is slow to open the handshake, where a blank dialog would look broken.
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
