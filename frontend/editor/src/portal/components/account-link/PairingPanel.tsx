import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton } from "@app/ui";
import { usePairing } from "@portal/hooks/usePairing";
import "@portal/components/account-link/PairingPanel.css";

interface Props {
  /** Only polls while true, so a closed dialog costs nothing. */
  active: boolean;
  /** Fired once the pairing is approved and the credential is stored. */
  onLinked: () => void | Promise<void>;
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Shows the pairing code for this server and waits for a team leader to approve
 * it (device grant, RFC 8628).
 *
 * <p>This is what replaces signing in to Stirling on the server itself. The admin
 * can approve from any device, which is the only way SSO and sign-up can work:
 * a customer's own origin can never be on the identity provider's redirect
 * allow-list, so the human half of the flow has to happen on our site.
 */
export function PairingPanel({ active, onLinked }: Props) {
  const { t } = useTranslation();
  const { view, secondsLeft, starting, error, restart } = usePairing(
    active,
    onLinked,
  );

  if (error) {
    return (
      <div className="portal-pairing">
        <Banner
          tone="danger"
          title={t(
            "portal.accountLink.pairing.error.title",
            "Could not reach Stirling",
          )}
        >
          {t(
            "portal.accountLink.pairing.error.body",
            "This server could not start a pairing. Check its outbound network access, then try again.",
          )}
        </Banner>
        <div className="portal-pairing__actions">
          <Button variant="primary" onClick={() => void restart()}>
            {t("portal.accountLink.pairing.retry", "Try again")}
          </Button>
        </div>
      </div>
    );
  }

  if (starting || !view || view.phase === "idle") {
    return (
      <div className="portal-pairing">
        <Skeleton height="3.5rem" />
        <Skeleton height="1rem" width="12rem" />
      </div>
    );
  }

  if (view.phase === "expired" || view.phase === "denied") {
    const expired = view.phase === "expired";
    return (
      <div className="portal-pairing">
        <Banner
          tone="warning"
          title={
            expired
              ? t("portal.accountLink.pairing.expired.title", "Code expired")
              : t("portal.accountLink.pairing.denied.title", "Pairing declined")
          }
        >
          {expired
            ? t(
                "portal.accountLink.pairing.expired.body",
                "Pairing codes are short lived. Generate a new one to try again.",
              )
            : t(
                "portal.accountLink.pairing.denied.body",
                "Someone declined this pairing on the Stirling site. Generate a new code if that was not intended.",
              )}
        </Banner>
        <div className="portal-pairing__actions">
          <Button variant="primary" onClick={() => void restart()}>
            {t("portal.accountLink.pairing.newCode", "Get a new code")}
          </Button>
        </div>
      </div>
    );
  }

  if (view.phase === "linked") {
    return (
      <div className="portal-pairing">
        <Banner
          tone="success"
          title={t("portal.accountLink.pairing.linked.title", "Server paired")}
        >
          {t(
            "portal.accountLink.pairing.linked.body",
            "This server is now connected to your Stirling account.",
          )}
        </Banner>
      </div>
    );
  }

  return (
    <div className="portal-pairing">
      <p className="portal-pairing__lead">
        {t(
          "portal.accountLink.pairing.lead",
          "Open this address on any device and enter the code below.",
        )}
      </p>

      <p className="portal-pairing__uri">{view.verificationUri}</p>

      <p
        className="portal-pairing__code"
        aria-label={t(
          "portal.accountLink.pairing.codeLabel",
          "Your pairing code",
        )}
      >
        {view.userCode}
      </p>

      <p className="portal-pairing__wait" role="status">
        {secondsLeft != null
          ? t(
              "portal.accountLink.pairing.waitingWithExpiry",
              "Waiting for approval. Expires in {{countdown}}.",
              { countdown: formatCountdown(secondsLeft) },
            )
          : t(
              "portal.accountLink.pairing.waiting",
              "Waiting for approval on the Stirling site.",
            )}
      </p>

      <p className="portal-pairing__hint">
        {t(
          "portal.accountLink.pairing.leaderHint",
          "A team owner has to approve it. They will be shown this server's name and address so they can check it is yours.",
        )}
      </p>
    </div>
  );
}
