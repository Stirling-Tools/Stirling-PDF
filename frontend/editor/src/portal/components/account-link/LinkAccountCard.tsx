import { useState } from "react";
import { Icon } from "@app/ui/Icon";
import { useTranslation } from "react-i18next";
import { Banner, Button, InfoTooltip, Modal, Skeleton } from "@app/ui";
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
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

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
          <div className="portal-link__section-head">
            <h2>
              {link.status?.name ??
                t("portal.accountLink.card.title", "Stirling Cloud")}
            </h2>
            {linked && (
              <InfoTooltip
                label={t(
                  "portal.accountLink.card.billingNote",
                  "This server shares your team’s processing allowance in Stirling Cloud.",
                )}
              />
            )}
          </div>
        </div>
        <span className="portal-link__status">
          {linked ? (
            <Icon name="circle-check" size={20} />
          ) : (
            <Icon name="unlink" size={20} />
          )}
          {linked
            ? t("portal.accountLink.card.linked", "Connected")
            : t("portal.accountLink.card.notLinked", "Not connected")}
        </span>
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
          <Button
            variant="quiet"
            accent="neutral"
            leftSection={<Icon name="unlink" size={20} />}
            loading={linking}
            onClick={() => setConfirmDisconnect(true)}
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
      <Modal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        width="sm"
        title={t(
          "portal.accountLink.card.disconnectTitle",
          "Disconnect this instance?",
        )}
        footer={
          <div className="account-connection__actions">
            <Button
              variant="secondary"
              onClick={() => setConfirmDisconnect(false)}
              data-autofocus
            >
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              accent="danger"
              onClick={() => {
                setConfirmDisconnect(false);
                void link.unlink();
              }}
            >
              {t("portal.accountLink.card.unlink", "Disconnect this instance")}
            </Button>
          </div>
        }
      >
        <p>
          {t(
            "portal.accountLink.card.disconnectBody",
            "This server will stop using your team’s processing allowance in Stirling Cloud. Your local files stay on this server. To connect again, follow the original connection steps.",
          )}
        </p>
      </Modal>
    </section>
  );
}
