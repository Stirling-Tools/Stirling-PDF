import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton, StatusBadge } from "@app/ui";
import "@app/components/settings/AccountConnectionLayout.css";
import type { UseAccountLink } from "@portal/hooks/useAccountLink";
import { useUI } from "@portal/contexts/UIContext";
import { useLinkedAccountEmail } from "@portal/hooks/useLinkedAccountEmail";

interface Props {
  link: UseAccountLink;
}

/** Uses the existing top-level connection flow; device credentials stay on the server. */
export function LinkAccountCard({ link }: Props) {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  const email = useLinkedAccountEmail();
  const linking = link.phase === "linking";
  const linked = link.status?.linked ?? false;

  if (link.statusError) {
    return (
      <section className="account-connection__team">
        <Banner
          tone="danger"
          title={t(
            "portal.accountLink.card.statusError",
            "Couldn’t check the account connection",
          )}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void link.refresh()}
            >
              {t("settings.connectedInstances.retry", "Try again")}
            </Button>
          }
        >
          {link.statusError}
        </Banner>
      </section>
    );
  }
  if (!link.status) {
    return (
      <section
        className="account-connection__team"
        role="status"
        aria-label={t(
          "portal.accountLink.card.loading",
          "Checking account connection",
        )}
      >
        <Skeleton height="8rem" />
      </section>
    );
  }

  return (
    <section className="account-connection__team portal-link__card">
      <div className="portal-link__card-head">
        <div>
          <span className="account-connection__eyebrow">
            {t("portal.accountLink.card.eyebrow", "This instance")}
          </span>
          <h2>
            {link.status?.name ??
              t("portal.accountLink.card.title", "Stirling Cloud")}
          </h2>
        </div>
        <StatusBadge tone={linked ? "success" : "neutral"} size="sm">
          {linked
            ? t("portal.accountLink.card.linked", "Connected")
            : t("portal.accountLink.card.notLinked", "Not connected")}
        </StatusBadge>
      </div>

      {email && (
        <p className="portal-link__account">
          {t(
            "portal.accountLink.card.signedInAs",
            "Signed in to Stirling Cloud as",
          )}{" "}
          <strong>{email}</strong>
        </p>
      )}

      {!link.loginConfigured && !linked && (
        <Banner
          tone="neutral"
          title={t(
            "portal.accountLink.card.loginNotConfigured.title",
            "Account connection unavailable",
          )}
        >
          {t(
            "portal.accountLink.card.loginNotConfigured.description",
            "Ask your server administrator to enable the connection to Stirling Cloud.",
          )}
        </Banner>
      )}

      {link.error && (
        <Banner
          tone="danger"
          title={t(
            "portal.accountLink.card.error.title",
            "Couldn’t update the connection",
          )}
        >
          {link.error}
        </Banner>
      )}

      {linked ? (
        <div className="portal-link__actions">
          <span className="portal-link__muted">
            {t(
              "portal.accountLink.card.billingNote",
              "This server shares your team’s processing allowance in Stirling Cloud.",
            )}
          </span>
          <Button
            variant="quiet"
            accent="danger"
            loading={linking}
            onClick={link.unlink}
          >
            {t("portal.accountLink.card.unlink", "Disconnect this instance")}
          </Button>
        </div>
      ) : (
        <div className="portal-link__connect">
          <p>
            {t(
              "portal.accountLink.card.connectDescription",
              "Connect this server to use your team’s processing allowance in Stirling Cloud.",
            )}
          </p>
          <Button loading={linking} onClick={() => openLinkModal()}>
            {t(
              "portal.accountLink.card.linkButton",
              "Connect your Stirling account",
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
