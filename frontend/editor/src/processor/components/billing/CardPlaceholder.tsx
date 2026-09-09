import { useTranslation } from "react-i18next";
import { LockIcon } from "@processor/components/icons";
import "@processor/theme/surface.css";

/**
 * Card-form stand-in shown on the checkout payment step when no Stripe publishable key is configured
 * (Storybook / preview / mis-config), so the step still reads correctly without mounting Stripe.
 * Shared by the subscription checkout and the prepaid-bundle checkout modals.
 */
export function CardPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="processor-surface processor-billing__card-placeholder">
      <div className="processor-billing__card-placeholder-head">
        <span>
          {t("processor.billing.checkout.card.label", "Card details")}
        </span>
        <span className="processor-billing__card-placeholder-badge">
          Stripe
        </span>
      </div>
      <div className="processor-billing__card-placeholder-field">
        <LockIcon size={13} />
        <span>
          {t(
            "processor.billing.checkout.card.fields",
            "Card number · MM / YY · CVC · ZIP",
          )}
        </span>
      </div>
      <p className="processor-billing__card-placeholder-note">
        {t(
          "processor.billing.checkout.card.note",
          "Card details collected by Stripe. Stirling never stores PAN or CVC.",
        )}
      </p>
    </div>
  );
}
