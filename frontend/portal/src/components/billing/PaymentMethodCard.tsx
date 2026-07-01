import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@shared/components";
import { fetchPaymentMethod, type PaymentMethod } from "@portal/api/billing";

interface Props {
  /** Opens the Stripe customer portal (card changes live in Stripe, not here). */
  onManage: () => void;
  managing?: boolean;
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * The team's default card, read from the Stripe mirror via
 * {@code GET /api/v1/payg/payment-method}. When the mirror doesn't carry the
 * card (table not synced, or no card on file) we don't invent one — we show a
 * neutral "managed in Stripe" state. Editing always happens in Stripe's portal;
 * the Update button just deep-links there.
 */
export function PaymentMethodCard({ onManage, managing }: Props) {
  const { t } = useTranslation();
  // undefined = loading, null = none/unavailable, object = real card.
  const [pm, setPm] = useState<PaymentMethod | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchPaymentMethod()
      .then((p) => {
        if (!cancelled) setPm(p.present ? p : null);
      })
      .catch(() => {
        if (!cancelled) setPm(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasCard = pm != null && pm.last4 != null;

  return (
    <Card padding="loose">
      <div className="portal-billing__subscription-head">
        <div>
          <span className="portal-billing__eyebrow">
            {t("billing.paymentMethod.eyebrow", "Payment method")}
          </span>
          {hasCard ? (
            <>
              <h3 className="portal-billing__section-title">
                {t(
                  "billing.paymentMethod.cardEnding",
                  "{{brand}} ending {{last4}}",
                  {
                    brand: titleCase(
                      pm.brand ??
                        t("billing.paymentMethod.cardFallback", "Card"),
                    ),
                    last4: pm.last4,
                  },
                )}
              </h3>
              <p className="portal-billing__section-sub">
                {pm.expMonth != null && pm.expYear != null
                  ? t(
                      "billing.paymentMethod.expiresBilledMonthly",
                      "Expires {{expiry}} · billed monthly",
                      {
                        expiry: `${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}`,
                      },
                    )
                  : t("billing.paymentMethod.billedMonthly", "Billed monthly")}
              </p>
            </>
          ) : (
            <>
              <h3 className="portal-billing__section-title">
                {t("billing.paymentMethod.managedTitle", "Managed in Stripe")}
              </h3>
              <p className="portal-billing__section-sub">
                {t(
                  "billing.paymentMethod.managedSub",
                  "Your card and billing details are kept securely in Stripe's customer portal.",
                )}
              </p>
            </>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={managing}
          onClick={onManage}
        >
          {t("billing.paymentMethod.update", "Update")}
        </Button>
      </div>
    </Card>
  );
}
