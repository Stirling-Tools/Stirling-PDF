import { useTranslation } from "react-i18next";
import { Button, Card } from "@shared/components";

interface Props {
  /** Render without the Card wrapper, to embed inside another card's column. */
  bare?: boolean;
}

/**
 * Volume-discount / Enterprise upsell, shared by the free and subscribed billing
 * views. The CTA is intentionally inert until the sales/quote URL is confirmed.
 */
export function EnterpriseUpsell({ bare = false }: Props) {
  const { t } = useTranslation();
  const body = (
    <>
      <span className="portal-billing__eyebrow">
        {t("billing.enterpriseUpsell.eyebrow", "Volume discount · 1M+ PDFs")}
      </span>
      <div className="portal-billing__enterprise-head">
        <div>
          <h3 className="portal-billing__section-title">
            {t("billing.enterpriseUpsell.title", "Stirling Enterprise")}
          </h3>
          <p className="portal-billing__section-sub">
            {t(
              "billing.enterpriseUpsell.description",
              "Committed volume discounts, air-gapped deployment, custom MSA and security reviews, and 3rd-party distributor partnerships.",
            )}
          </p>
        </div>
        {/* Destination wired when the enterprise/sales URL is confirmed. */}
        <Button variant="gradient" size="sm" disabled>
          {t("billing.enterpriseUpsell.cta", "Build your Enterprise quote")}
        </Button>
      </div>
    </>
  );
  if (bare)
    return <div className="portal-billing__enterprise-bare">{body}</div>;
  return <Card padding="loose">{body}</Card>;
}
