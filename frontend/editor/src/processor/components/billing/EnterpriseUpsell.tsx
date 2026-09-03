import { useTranslation } from "react-i18next";
import { Button, Card } from "@app/ui";
import { useUI } from "@processor/contexts/UIContext";
import { useView } from "@processor/contexts/ViewContext";

interface Props {
  /** Render without the Card wrapper, to embed inside another card's column. */
  bare?: boolean;
}

/**
 * Volume-discount / Enterprise upsell, shared by the free and subscribed billing
 * views. The CTA lands the buyer on Home with the trial-setup step raised — the deal lives there,
 * so there is nowhere else to send them.
 */
export function EnterpriseUpsell({ bare = false }: Props) {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  const { requestTrialSetup } = useUI();
  const body = (
    <>
      <span className="processor-billing__eyebrow">
        {t(
          "processor.billing.enterpriseUpsell.eyebrow",
          "Volume discount · 1M+ PDFs",
        )}
      </span>
      <div className="processor-billing__enterprise-head">
        <div>
          <h3 className="processor-billing__section-title">
            {t(
              "processor.billing.enterpriseUpsell.title",
              "Stirling Enterprise",
            )}
          </h3>
          <p className="processor-billing__section-sub">
            {t(
              "processor.billing.enterpriseUpsell.description",
              "Committed volume discounts, air-gapped deployment, custom MSA and security reviews, and 3rd-party distributor partnerships.",
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            // The deal lives on Home; raise the request there rather than sending the buyer to a
            // separate view that only mirrors it.
            requestTrialSetup();
            setActiveView("home");
          }}
        >
          {t("processor.billing.enterpriseUpsell.cta", "Explore Enterprise")}
        </Button>
      </div>
    </>
  );
  if (bare)
    return <div className="processor-billing__enterprise-bare">{body}</div>;
  return <Card padding="loose">{body}</Card>;
}
