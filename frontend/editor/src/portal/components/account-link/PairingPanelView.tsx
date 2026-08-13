import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton } from "@app/ui";
import type { PairingView } from "@portal/api/link";
import "@portal/components/account-link/PairingPanel.css";

export interface PairingPanelViewProps {
  /** Null while the first status read is in flight. */
  view: PairingView | null;
  /** Seconds until the code stops working; null when there is no live code. */
  secondsLeft: number | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * The approval URL with the code prefilled.
 *
 * <p>Built with URL rather than string concatenation so a verification URI that
 * already carries a query or a path (a deployment under a subpath, say) gains the
 * parameter instead of ending up with two question marks. A URI we cannot parse
 * is returned untouched: a plain link the admin can still follow beats a dead one.
 */
function approvalHref(uri: string, userCode: string | null): string {
  if (!userCode) return uri;
  try {
    const url = new URL(uri);
    url.searchParams.set("code", userCode);
    return url.toString();
  } catch {
    return uri;
  }
}

/**
 * Presentation for the pairing panel. Pure: every state is reachable by props
 * alone, so Storybook and the a11y scan cover the whole flow without mocking a
 * network or waiting out a countdown. {@link PairingPanel} supplies the data.
 */
export function PairingPanelView({
  view,
  secondsLeft,
  loading,
  error,
  onRetry,
}: PairingPanelViewProps) {
  const { t } = useTranslation();

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
          <Button variant="primary" onClick={onRetry}>
            {t("portal.accountLink.pairing.retry", "Try again")}
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !view || view.phase === "idle") {
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
          <Button variant="primary" onClick={onRetry}>
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

      {/* A real link, opened in a new tab with the code already in the query, so the
          common case is one click rather than reading a URL across to another window
          and typing eight characters. The code stays on screen because the admin may
          be approving on a phone, where this tab is no help. */}
      {view.verificationUri ? (
        <a
          className="portal-pairing__uri"
          href={approvalHref(view.verificationUri, view.userCode)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {view.verificationUri}
        </a>
      ) : null}

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
