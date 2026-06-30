import { useTranslation } from "react-i18next";
import { Banner, Button, Card, StatusBadge } from "@shared/components";
import type { UseAccountLink } from "@portal/hooks/useAccountLink";
import { useUI } from "@portal/contexts/UIContext";

interface Props {
  link: UseAccountLink;
}

/**
 * Status + actions for THIS instance's account link. The "Link" button opens
 * the single top-level login modal (UIContext.openLinkModal) — never a nested
 * modal. The portal posts the returned JWT to the local backend, which stores
 * the device secret server-side; the secret is never received or rendered here.
 */
export function LinkAccountCard({ link }: Props) {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  const linking = link.phase === "linking";
  const linked = link.status?.linked ?? false;

  return (
    <Card padding="loose" className="portal-link__card">
      <div className="portal-link__card-head">
        <div>
          <span className="portal-link__eyebrow">
            {t("accountLink.card.eyebrow", "Account link")}
          </span>
          <h2 className="portal-link__title">
            {t(
              "accountLink.card.title",
              "Link this org to its Stirling account",
            )}
          </h2>
        </div>
        <StatusBadge tone={linked ? "success" : "neutral"} size="sm">
          {linked
            ? t("accountLink.card.linked", "Linked")
            : t("accountLink.card.notLinked", "Not linked")}
        </StatusBadge>
      </div>

      {!link.loginConfigured && (
        <Banner
          tone="neutral"
          title={t(
            "accountLink.card.loginNotConfigured.title",
            "SaaS login not configured",
          )}
        >
          {t("accountLink.card.loginNotConfigured.before", "Set")}{" "}
          <code>VITE_SAAS_SUPABASE_URL</code>{" "}
          {t(
            "accountLink.card.loginNotConfigured.after",
            "to enable account linking against the hosted Stirling account. In dev you can simulate sign-in from the link dialog.",
          )}
        </Banner>
      )}

      {link.error && (
        <Banner
          tone="danger"
          title={t("accountLink.card.error.title", "Couldn't link")}
        >
          {link.error}
        </Banner>
      )}

      {linked ? (
        <div className="portal-link__actions">
          <span className="portal-link__muted">
            {link.status?.name
              ? t("accountLink.card.linkedAs", "Linked as {{name}}.", {
                  name: link.status.name,
                })
              : t(
                  "accountLink.card.linkedGeneric",
                  "This instance is linked.",
                )}{" "}
            {t(
              "accountLink.card.billingNote",
              "Unattended processing bills against your org wallet.",
            )}
          </span>
          <Button
            variant="outline"
            accent="red"
            loading={linking}
            onClick={link.unlink}
          >
            {t("accountLink.card.unlink", "Unlink")}
          </Button>
        </div>
      ) : (
        <div className="portal-link__actions">
          <Button loading={linking} onClick={() => openLinkModal()}>
            {t("accountLink.card.linkButton", "Link your Stirling account")}
          </Button>
        </div>
      )}
    </Card>
  );
}
