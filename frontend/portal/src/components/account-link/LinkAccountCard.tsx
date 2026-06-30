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
            {t("accountLink.card.eyebrow")}
          </span>
          <h2 className="portal-link__title">{t("accountLink.card.title")}</h2>
        </div>
        <StatusBadge tone={linked ? "success" : "neutral"} size="sm">
          {linked
            ? t("accountLink.card.linked")
            : t("accountLink.card.notLinked")}
        </StatusBadge>
      </div>

      {!link.loginConfigured && (
        <Banner
          tone="neutral"
          title={t("accountLink.card.loginNotConfigured.title")}
        >
          {t("accountLink.card.loginNotConfigured.before")}{" "}
          <code>VITE_SAAS_SUPABASE_URL</code>{" "}
          {t("accountLink.card.loginNotConfigured.after")}
        </Banner>
      )}

      {link.error && (
        <Banner tone="danger" title={t("accountLink.card.error.title")}>
          {link.error}
        </Banner>
      )}

      {linked ? (
        <div className="portal-link__actions">
          <span className="portal-link__muted">
            {link.status?.name
              ? t("accountLink.card.linkedAs", { name: link.status.name })
              : t("accountLink.card.linkedGeneric")}{" "}
            {t("accountLink.card.billingNote")}
          </span>
          <Button
            variant="outline"
            accent="red"
            loading={linking}
            onClick={link.unlink}
          >
            {t("accountLink.card.unlink")}
          </Button>
        </div>
      ) : (
        <div className="portal-link__actions">
          <Button loading={linking} onClick={() => openLinkModal()}>
            {t("accountLink.card.linkButton")}
          </Button>
        </div>
      )}
    </Card>
  );
}
