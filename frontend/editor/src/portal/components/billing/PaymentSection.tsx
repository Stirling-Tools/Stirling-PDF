import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KvRow } from "@app/billing";
import { fetchPaymentMethod, type PaymentMethod } from "@portal/api/billing";

/**
 * The Payment section's contents for the portal host.
 *
 * <p>Reads the default card off the Stripe mirror. {@code present: false} means the mirror carries
 * no card, which is the same shape as "not synced yet", so the row says the card is missing rather
 * than inventing a brand.
 *
 * <p>Card edits happen in Stripe's own portal, so the door opens that rather than a form here.
 */
export function PaymentSection({
  onManage,
  managing = false,
}: {
  /** Opens the Stripe customer portal. */
  onManage?: () => void;
  managing?: boolean;
}) {
  const { t } = useTranslation();
  const [pm, setPm] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Best-effort: a failed read leaves the row on its "no card" copy rather than breaking the
    // section, because the rest of the screen does not depend on it.
    fetchPaymentMethod()
      .then((m) => {
        if (!cancelled) setPm(m);
      })
      .catch(() => {
        if (!cancelled) setPm(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const card =
    pm?.present && pm.brand && pm.last4
      ? pm.expMonth && pm.expYear
        ? t(
            "portal.billing.payment.cardWithExpiry",
            "{{brand}} ending {{last4}} · expires {{month}} / {{year}}",
            {
              brand: pm.brand,
              last4: pm.last4,
              month: String(pm.expMonth).padStart(2, "0"),
              year: pm.expYear,
            },
          )
        : t("portal.billing.payment.card", "{{brand}} ending {{last4}}", {
            brand: pm.brand,
            last4: pm.last4,
          })
      : t("portal.billing.payment.noCard", "No card on file");

  return (
    <KvRow
      label={t("portal.billing.payment.method", "Payment method")}
      value={card}
      door={
        onManage ? (
          <button type="button" onClick={onManage} disabled={managing}>
            {t("portal.billing.payment.update", "Update")}
          </button>
        ) : undefined
      }
    />
  );
}
