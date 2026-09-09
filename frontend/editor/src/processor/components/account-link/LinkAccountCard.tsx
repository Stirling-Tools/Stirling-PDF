import { useTranslation } from "react-i18next";
import { Banner, Button, Card, StatusBadge } from "@app/ui";
import type { UseAccountLink } from "@processor/hooks/useAccountLink";
import { useUI } from "@processor/contexts/UIContext";

interface Props {
  link: UseAccountLink;
}

/**
 * Status + actions for THIS instance's account link. The "Link" button opens
 * the single top-level login modal (UIContext.openLinkModal) — never a nested
 * modal. The processor posts the returned JWT to the local backend, which stores
 * the device secret server-side; the secret is never received or rendered here.
 */
export function LinkAccountCard({ link }: Props) {
  const { t } = useTranslation();
  const { openLinkModal } = useUI();
  const linking = link.phase === "linking";
  const linked = link.status?.linked ?? false;

  return (
    <Card padding="loose" className="processor-link__card">
      <div className="processor-link__card-head">
        <div>
          <span className="processor-link__eyebrow">
            {t("processor.accountLink.card.eyebrow", "Account link")}
          </span>
          <h2 className="processor-link__title">
            {t(
              "processor.accountLink.card.title",
              "Link this org to its Stirling account",
            )}
          </h2>
        </div>
        <StatusBadge tone={linked ? "success" : "neutral"} size="sm">
          {linked
            ? t("processor.accountLink.card.linked", "Linked")
            : t("processor.accountLink.card.notLinked", "Not linked")}
        </StatusBadge>
      </div>

      {!link.loginConfigured && (
        <Banner
          tone="neutral"
          title={t(
            "processor.accountLink.card.loginNotConfigured.title",
            "SaaS login not configured",
          )}
        >
          {t("processor.accountLink.card.loginNotConfigured.before", "Set")}{" "}
          <code>VITE_SUPABASE_URL</code>{" "}
          {t(
            "processor.accountLink.card.loginNotConfigured.after",
            "to enable account linking against the hosted Stirling account. In dev you can simulate sign-in from the link dialog.",
          )}
        </Banner>
      )}

      {link.error && (
        <Banner
          tone="danger"
          title={t("processor.accountLink.card.error.title", "Couldn't link")}
        >
          {link.error}
        </Banner>
      )}

      {linked ? (
        <div className="processor-link__actions">
          <span className="processor-link__muted">
            {link.status?.name
              ? t(
                  "processor.accountLink.card.linkedAs",
                  "Linked as {{name}}.",
                  {
                    name: link.status.name,
                  },
                )
              : t(
                  "processor.accountLink.card.linkedGeneric",
                  "This instance is linked.",
                )}{" "}
            {t(
              "processor.accountLink.card.billingNote",
              "Unattended processing bills against your org wallet.",
            )}
          </span>
          <Button
            variant="secondary"
            accent="danger"
            loading={linking}
            onClick={link.unlink}
          >
            {t("processor.accountLink.card.unlink", "Unlink")}
          </Button>
        </div>
      ) : (
        <div className="processor-link__actions">
          <Button loading={linking} onClick={() => openLinkModal()}>
            {t(
              "processor.accountLink.card.linkButton",
              "Link your Stirling account",
            )}
          </Button>
        </div>
      )}
    </Card>
  );
}
