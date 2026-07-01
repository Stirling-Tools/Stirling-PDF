import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@shared/components";
import "@portal/views/Procurement.css";

/**
 * The enterprise on-ramp that starts a procurement, mirroring the marketing prototype's CTAs. On
 * Home it's the "Process millions of PDFs / Start Trial" card; on the Usage/Billing page it's the
 * "Standardize / Build your Enterprise quote" card that deep-links into the quote builder. Both
 * route to /procurement (the same entry as loading that path directly).
 */
export function EnterpriseUpsellCard({
  variant = "home",
}: {
  variant?: "home" | "usage";
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const usage = variant === "usage";
  // Literal keys (not interpolated) so the translation-coverage check can see them.
  const copy = usage
    ? {
        badge: t("procurement.upsell.usageBadge"),
        headline: t("procurement.upsell.usageHeadline"),
        body: t("procurement.upsell.usageBody"),
        cta: t("procurement.upsell.usageCta"),
      }
    : {
        badge: t("procurement.upsell.homeBadge"),
        headline: t("procurement.upsell.homeHeadline"),
        body: t("procurement.upsell.homeBody"),
        cta: t("procurement.upsell.homeCta"),
      };

  return (
    <Card className="portal-proc__upsell">
      <div className="portal-proc__upsell-text">
        <span className="portal-proc__upsell-badge">{copy.badge}</span>
        <p className="portal-proc__upsell-copy">
          <strong>{copy.headline} </strong>
          {copy.body}
        </p>
      </div>
      <Button
        variant={usage ? "gradient" : "outline"}
        accent="blue"
        onClick={() =>
          navigate(usage ? "/procurement?start=quote" : "/procurement")
        }
      >
        {copy.cta}
      </Button>
    </Card>
  );
}
