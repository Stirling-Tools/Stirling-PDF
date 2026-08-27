import { useTranslation } from "react-i18next";
import { Skeleton } from "@app/ui";
import "@portal/components/account-link/connect/connect.css";

/**
 * Step 2 of the connect flow: the moment between asking and arriving.
 *
 * <p>A ghost rather than a screen. This step used to explain the redirect and wait for a second
 * click, which asked the admin to read something they had already decided on and put a page between
 * them and the thing they clicked. The explanation moved to step 1, next to the button that names
 * the destination, and what is left here is the hand-off itself: the browser is on its way out, so
 * the step shows the shape of what is coming rather than pretending to be content.
 *
 * <p>Normally on screen for well under a second. It matters when the instance's own backend is slow
 * to open the handshake, which is exactly when a blank dialog would look broken. Carries no error
 * state: a failed hand-off drops back to step 1, which is where the reason is shown.
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
