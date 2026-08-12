import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  type CellLink,
  column,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Skeleton,
} from "@app/ui";
import { formatMinor, formatPeriodDate } from "@app/billing";
import { fetchInvoices, type Invoice } from "@portal/api/billing";

const DEFAULT_VISIBLE = 5;
/** Fetch a few more than DEFAULT_VISIBLE so "Show more" actually has something to show. */
const FETCH_LIMIT = 20;

function statusTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "paid":
      return "success";
    case "open":
    case "draft":
      return "warning";
    case "uncollectible":
    case "void":
      return "danger";
    default:
      return "neutral";
  }
}

/**
 * Recent Stripe invoices, sourced from GET /api/v1/payg/invoices (reads
 * stripe.invoices via the Sync Engine). Backend orders newest first AND
 * filters out drafts (matching Stripe's own customer portal behavior —
 * drafts have no public hosted URL or PDF). We fetch FETCH_LIMIT rows and
 * show DEFAULT_VISIBLE by default with a "Show all N" inline toggle. For
 * history older than FETCH_LIMIT, the Stripe customer portal (button on the
 * Subscription card above) is the authoritative archive.
 *
 * Each row links straight out to Stripe-hosted assets — the invoice page
 * ({@code hostedInvoiceUrl}) and the PDF ({@code invoicePdf}). Rendered as
 * actual {@code <a target="_blank">} anchors rather than {@code window.open}
 * handlers so they're real user gestures (popup blockers don't trip).
 */
export function InvoicesList() {
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchInvoices(FETCH_LIMIT)
      .then((rows) => {
        if (!cancelled) setInvoices(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const total = invoices?.length ?? 0;
  const visible = showAll ? total : Math.min(DEFAULT_VISIBLE, total);
  const visibleRows = invoices?.slice(0, visible) ?? [];
  const hasMore = total > DEFAULT_VISIBLE;
  // We only fetched FETCH_LIMIT rows — at the cap there may be older invoices we
  // didn't load, so don't claim "all".
  const atFetchLimit = total >= FETCH_LIMIT;

  // Column layout mirrors Stripe's own customer-portal "Invoice history" rows:
  //   Date · Amount · Status · Description (product name) · Actions
  // The monospace invoice id is dropped — users care about "what was it for",
  // not the internal id.
  const columns: DataTableColumn<Invoice>[] = [
    column.text({
      key: "date",
      header: t("portal.billing.invoices.columnDate", "Date"),
      sortable: true,
      // Sort chronologically on the raw ISO timestamp, not the formatted label.
      sortBy: (inv) => inv.createdAt ?? undefined,
      get: (inv) =>
        inv.createdAt ? formatPeriodDate(inv.createdAt, { year: true }) : "-",
    }),
    column.number({
      key: "pdfs",
      header: t(
        "portal.billing.invoices.columnPdfsProcessed",
        "PDFs processed",
      ),
      sortable: true,
      // Billed units on the invoice's metered line item; blank when the
      // line-item table isn't synced into the Stripe mirror.
      get: (inv) => inv.pdfsProcessed,
      format: (n) => n.toLocaleString(),
    }),
    column.number({
      key: "amount",
      header: t("portal.billing.invoices.columnAmount", "Amount"),
      sortable: true,
      get: (inv) => inv.totalMinor,
      format: (n, inv) => formatMinor(n, inv.currency),
    }),
    column.badge({
      key: "status",
      header: t("portal.billing.invoices.columnStatus", "Status"),
      sortable: true,
      get: (inv) => ({ tone: statusTone(inv.status), label: inv.status }),
    }),
    column.text({
      key: "description",
      header: t("portal.billing.invoices.columnDescription", "Description"),
      sortable: true,
      get: (inv) =>
        inv.description ??
        t("portal.billing.invoices.descriptionFallback", "Invoice"),
    }),
    column.links({
      key: "actions",
      get: (inv) => {
        const out: CellLink[] = [];
        if (inv.hostedInvoiceUrl) {
          out.push({
            label: t("portal.billing.invoices.viewLink", "View ↗"),
            href: inv.hostedInvoiceUrl,
            ariaLabel: t(
              "portal.billing.invoices.viewAriaLabel",
              "View invoice {{number}} in Stripe",
              { number: inv.number ?? inv.id },
            ),
          });
        }
        if (inv.invoicePdf) {
          out.push({
            label: t("portal.billing.invoices.pdfLink", "PDF ↓"),
            href: inv.invoicePdf,
            ariaLabel: t(
              "portal.billing.invoices.downloadAriaLabel",
              "Download invoice {{number}} as PDF",
              { number: inv.number ?? inv.id },
            ),
          });
        }
        return out;
      },
    }),
  ];

  return (
    <Card padding="loose">
      <h3 className="portal-billing__section-title">
        {t("portal.billing.invoices.title", "Invoice history")}
      </h3>

      {invoices === null && !error && (
        <div className="portal-billing__skeleton" aria-hidden>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </div>
      )}

      {error && (
        <p className="portal-billing__error" role="alert">
          {t(
            "portal.billing.invoices.loadError",
            "Couldn't load invoices: {{error}}",
            { error },
          )}
        </p>
      )}

      {invoices !== null && invoices.length === 0 && !error && (
        <EmptyState
          size="compact"
          title={t("portal.billing.invoices.emptyTitle", "No invoices yet")}
          description={t(
            "portal.billing.invoices.emptyDescription",
            "Once your team subscribes and the first cycle closes, your invoices appear here.",
          )}
        />
      )}

      {invoices !== null && invoices.length > 0 && (
        <>
          <DataTable
            columns={columns}
            rows={visibleRows}
            rowKey={(inv) => inv.id}
            defaultSort={{ key: "date", direction: "desc" }}
          />
          {hasMore && (
            <div className="portal-billing__invoice-footer">
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll
                  ? t(
                      "portal.billing.invoices.showFewer",
                      "Show fewer (top {{count}})",
                      { count: DEFAULT_VISIBLE },
                    )
                  : atFetchLimit
                    ? t(
                        "portal.billing.invoices.showMostRecent",
                        "Show {{count}} most recent",
                        { count: total },
                      )
                    : t(
                        "portal.billing.invoices.showAll",
                        "Show all {{count}}",
                        {
                          count: total,
                        },
                      )}
              </Button>
              {showAll && atFetchLimit && (
                <span className="portal-billing__invoice-note">
                  {t(
                    "portal.billing.invoices.fetchLimitNote",
                    "Showing your {{count}} most recent invoices. Older invoices are in the Stripe portal.",
                    { count: FETCH_LIMIT },
                  )}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
