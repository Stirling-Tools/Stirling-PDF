import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { useView } from "@portal/contexts/ViewContext";

interface Props {
  /** Render without the Card wrapper, to embed inside another card's column. */
  bare?: boolean;
}

/**
 * Volume-discount / Enterprise upsell, shared by the free and subscribed billing
 * views. The CTA opens the procurement journey (/procurement auto-opens the quote
 * builder in the takeover modal).
 */
export function EnterpriseUpsell({ bare = false }: Props) {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  const body = (
    <>
      <span className="portal-billing__eyebrow">
        {t(
          "portal.billing.enterpriseUpsell.eyebrow",
          "Volume discount · 1M+ PDFs",
        )}
      </span>
      <div className="portal-billing__enterprise-head">
        <div>
          <h3 className="portal-billing__section-title">
            {t("portal.billing.enterpriseUpsell.title", "Stirling Enterprise")}
          </h3>
          <p className="portal-billing__section-sub">
            {t(
              "portal.billing.enterpriseUpsell.description",
              "Committed volume discounts, air-gapped deployment, custom MSA and security reviews, and 3rd-party distributor partnerships.",
            )}
          </p>
        </div>
        <Button size="sm" onClick={() => setActiveView("procurement")}>
          {t("portal.billing.enterpriseUpsell.cta", "Explore Enterprise")}
        </Button>
      </div>
    </>
  );
  if (bare)
    return <div className="portal-billing__enterprise-bare">{body}</div>;
  return <Card padding="loose">{body}</Card>;
}
