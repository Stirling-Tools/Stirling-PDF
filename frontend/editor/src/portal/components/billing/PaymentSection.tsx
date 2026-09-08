import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KvRow, formatMinor, formatPeriodDate } from "@app/billing";
import {
  fetchBillingDetails,
  fetchPaymentMethod,
  type BillingDetails,
  type PaymentMethod,
  type Wallet,
} from "@portal/api/billing";

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
  wallet,
  onManage,
  managing = false,
}: {
  /** Supplies the next-invoice date and estimate, which are already on the wallet. */
  wallet: Wallet;
  /** Opens the Stripe customer portal, which is where all of these are edited. */
  onManage?: () => void;
  managing?: boolean;
}) {
  const { t } = useTranslation();
  const [pm, setPm] = useState<PaymentMethod | null>(null);
  const [details, setDetails] = useState<BillingDetails | null>(null);

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
    fetchBillingDetails()
      .then((d) => {
        if (!cancelled) setDetails(d);
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
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

  // Every one of these is Stripe's to edit, so they share one door into its hosted portal rather
  // than each growing a form against a mirror that cannot be written.
  const update = onManage ? (
    <button type="button" onClick={onManage} disabled={managing}>
      {t("portal.billing.payment.update", "Update")}
    </button>
  ) : undefined;

  return (
    <>
      <KvRow
        label={t("portal.billing.payment.method", "Payment method")}
        value={card}
        door={update}
      />
      <KvRow
        label={t("portal.billing.payment.nextInvoice", "Next invoice")}
        note={
          wallet.processor.active
            ? t(
                "portal.billing.payment.nextInvoiceNote",
                "from this cycle's pace",
              )
            : undefined
        }
        value={
          wallet.estimatedBillMinor != null
            ? t(
                "portal.billing.payment.nextInvoiceValue",
                "{{date}} · {{amount}}",
                {
                  date: formatPeriodDate(wallet.billingPeriodEnd, {
                    year: true,
                  }),
                  amount: formatMinor(
                    wallet.estimatedBillMinor,
                    wallet.currency,
                  ),
                },
              )
            : formatPeriodDate(wallet.billingPeriodEnd, { year: true })
        }
      />
      {details?.companyName && (
        <KvRow
          label={t("portal.billing.payment.billedTo", "Billed to")}
          value={details.companyName}
          door={update}
        />
      )}
      {details?.invoiceEmail && (
        <KvRow
          label={t("portal.billing.payment.invoicesTo", "Invoices go to")}
          value={details.invoiceEmail}
          door={update}
        />
      )}
    </>
  );
}
