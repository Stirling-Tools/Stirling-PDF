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
 * The Payment section for the portal host, read off the Stripe mirror.
 *
 * <p>{@code present: false} is indistinguishable from "not synced yet", so the row reports the
 * card as missing rather than inventing a brand.
 */
export function PaymentSection({
  wallet,
  onManage,
  managing = false,
}: {
  /** Supplies the next-invoice date and estimate. */
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
    // Best-effort: a failed read leaves the "no card" copy rather than breaking the section.
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

  // The mirror cannot be written, so every row shares one door into Stripe's hosted portal.
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
