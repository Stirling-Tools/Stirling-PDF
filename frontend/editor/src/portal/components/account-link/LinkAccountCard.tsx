import { useTranslation } from "react-i18next";
import { useAuth } from "@app/auth/UseSession";
import { Banner, Button, Card, StatusBadge } from "@app/ui";
import type { UseAccountLink } from "@portal/hooks/useAccountLink";
import { useUI } from "@portal/contexts/UIContext";

interface Props {
  link: UseAccountLink;
}

/**
 * Only the org owner can change this instance's link. The shared dialog handles the browser
 * handshake; device credentials remain on the server.
 */
export function LinkAccountCard({ link }: Props) {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  const { user } = useAuth();
  const canLink = user?.orgOwner === true;
  const linking = link.phase === "linking";
  const linked = link.status?.linked ?? false;

  return (
    <Card padding="loose" className="portal-link__card">
      <div className="portal-link__card-head">
        <div>
          <span className="portal-link__eyebrow">
            {t("portal.accountLink.card.eyebrow", "Account link")}
          </span>
          <h2 className="portal-link__title">
            {t(
              "portal.accountLink.card.title",
              "Link this org to its Stirling account",
            )}
          </h2>
        </div>
        <StatusBadge tone={linked ? "success" : "neutral"} size="sm">
          {linked
            ? t("portal.accountLink.card.linked", "Linked")
            : t("portal.accountLink.card.notLinked", "Not linked")}
        </StatusBadge>
      </div>

      {!link.loginConfigured && (
        <Banner
          tone="neutral"
          title={t(
            "portal.accountLink.card.loginNotConfigured.title",
            "SaaS login not configured",
          )}
        >
          {t("portal.accountLink.card.loginNotConfigured.before", "Set")}{" "}
          <code>VITE_SUPABASE_URL</code>{" "}
          {t(
            "portal.accountLink.card.loginNotConfigured.after",
            "to enable account linking against the hosted Stirling account. In dev you can simulate sign-in from the link dialog.",
          )}
        </Banner>
      )}

      {link.error && (
        <Banner
          tone="danger"
          title={t("portal.accountLink.card.error.title", "Couldn't link")}
        >
          {link.error}
        </Banner>
      )}

      {!canLink && (
        <p>
          {t(
            "portal.accountLink.ownerRequired",
            "Only the org owner can link or unlink this server.",
          )}
        </p>
      )}
      {linked ? (
        <div className="portal-link__actions">
          <span className="portal-link__muted">
            {link.status?.name
              ? t("portal.accountLink.card.linkedAs", "Linked as {{name}}.", {
                  name: link.status.name,
                })
              : t(
                  "portal.accountLink.card.linkedGeneric",
                  "This instance is linked.",
                )}{" "}
            {t(
              "portal.accountLink.card.billingNote",
              "Unattended processing bills against your org wallet.",
            )}
          </span>
          <Button
            variant="secondary"
            accent="danger"
            loading={linking}
            onClick={link.unlink}
            disabled={!canLink}
          >
            {t("portal.accountLink.card.unlink", "Unlink")}
          </Button>
        </div>
      ) : (
        <div className="portal-link__actions">
          <Button
            loading={linking}
            disabled={!canLink}
            onClick={() => openLinkModal()}
          >
            {t(
              "portal.accountLink.card.linkButton",
              "Link your Stirling account",
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
