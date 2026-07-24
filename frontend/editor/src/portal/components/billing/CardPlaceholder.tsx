import { useTranslation } from "react-i18next";
import { LockIcon } from "@portal/components/icons";

/**
 * Card-form stand-in shown on the checkout payment step when no Stripe publishable key is configured
 * (Storybook / preview / mis-config), so the step still reads correctly without mounting Stripe.
 * Shared by the subscription checkout and the prepaid-bundle checkout modals.
 */
export function CardPlaceholder() {
  const { t } = useTranslation();
  return (
    <div className="portal-billing__card-placeholder">
      <div className="portal-billing__card-placeholder-head">
        <span>{t("portal.billing.checkout.card.label", "Card details")}</span>
        <span className="portal-billing__card-placeholder-badge">Stripe</span>
      </div>
      <div className="portal-billing__card-placeholder-field">
        <LockIcon size={13} />
        <span>
          {t(
            "portal.billing.checkout.card.fields",
            "Card number · MM / YY · CVC · ZIP",
          )}
        </span>
      </div>
      <p className="portal-billing__card-placeholder-note">
        {t(
          "portal.billing.checkout.card.note",
          "Card details collected by Stripe. Stirling never stores PAN or CVC.",
        )}
      </p>
    </div>
  );
}
