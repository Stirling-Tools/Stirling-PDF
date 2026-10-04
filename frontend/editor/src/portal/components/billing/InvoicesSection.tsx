import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  InvoiceRow,
  formatMinor,
  formatPeriodDate,
  type InvoiceRowState,
} from "@app/billing";
import { fetchInvoices, type Invoice } from "@portal/api/billing";

const LIMIT = 6;

/**
 * Stripe's invoice statuses, mapped to the four states a row can show. {@code open} is issued but
 * unpaid, not a draft: the backend filters drafts out, since a draft has no document to open.
 */
function rowState(status: string): InvoiceRowState {
  switch (status) {
    case "paid":
      return "paid";
    case "open":
      return "current";
    case "uncollectible":
    case "void":
      return "failed";
    default:
      return "other";
  }
}

/**
 * The Invoices section for the portal host, newest first. Renders nothing when there are none, so
 * the host can drop the section and its chip.
 */
export function InvoicesSection({
  onEmpty,
}: {
  /** Called once the fetch settles with no invoices, so the host can drop the section. */
  onEmpty?: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Invoice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchInvoices(LIMIT)
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        if (r.length === 0) onEmpty?.();
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        onEmpty?.();
      });
    return () => {
      cancelled = true;
    };
  }, [onEmpty]);

  if (!rows || rows.length === 0) return null;

  const label = (s: InvoiceRowState, raw: string) =>
    s === "paid"
      ? t("portal.billing.invoiceRow.paid", "Paid")
      : s === "current"
        ? t("portal.billing.invoiceRow.current", "Current")
        : s === "failed"
          ? t("portal.billing.invoiceRow.failed", "Unpaid")
          : raw;

  return (
    <>
      {rows.map((inv) => {
        const state = rowState(inv.status);
        return (
          <InvoiceRow
            key={inv.id}
            date={
              inv.createdAt
                ? formatPeriodDate(inv.createdAt, { year: true })
                : t("portal.billing.invoiceRow.undated", "Undated")
            }
            description={inv.description}
            amount={
              inv.totalMinor != null
                ? formatMinor(inv.totalMinor, inv.currency)
                : t("portal.billing.invoiceRow.unknownAmount", "Unknown")
            }
            state={state}
            stateLabel={label(state, inv.status)}
            href={inv.hostedInvoiceUrl}
            viewLabel={t("portal.billing.invoiceRow.view", "View")}
          />
        );
      })}
    </>
  );
}
