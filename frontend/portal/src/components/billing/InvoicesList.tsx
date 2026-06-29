import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import { formatMinor, formatPeriodDate } from "@shared/billing";
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
  const columns: TableColumn<Invoice>[] = [
    {
      key: "date",
      header: t("billing.invoices.columnDate"),
      render: (inv) =>
        inv.createdAt ? formatPeriodDate(inv.createdAt, { year: true }) : "—",
    },
    {
      key: "pdfs",
      header: t("billing.invoices.columnPdfsProcessed"),
      align: "right",
      // Billed units on the invoice's metered line item; "—" when the
      // line-item table isn't synced into the Stripe mirror.
      render: (inv) =>
        inv.pdfsProcessed == null ? "—" : inv.pdfsProcessed.toLocaleString(),
    },
    {
      key: "amount",
      header: t("billing.invoices.columnAmount"),
      align: "right",
      render: (inv) =>
        inv.totalMinor == null
          ? "—"
          : formatMinor(inv.totalMinor, inv.currency),
    },
    {
      key: "status",
      header: t("billing.invoices.columnStatus"),
      render: (inv) => (
        <StatusBadge tone={statusTone(inv.status)} size="sm">
          {inv.status}
        </StatusBadge>
      ),
    },
    {
      key: "description",
      header: t("billing.invoices.columnDescription"),
      render: (inv) => (
        <span className="portal-billing__invoice-desc">
          {inv.description ?? t("billing.invoices.descriptionFallback")}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (inv) => (
        <div className="portal-billing__invoice-actions">
          {inv.hostedInvoiceUrl && (
            <a
              className="portal-billing__invoice-link"
              href={inv.hostedInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("billing.invoices.viewAriaLabel", {
                number: inv.number ?? inv.id,
              })}
            >
              {t("billing.invoices.viewLink")}
            </a>
          )}
          {inv.invoicePdf && (
            <a
              className="portal-billing__invoice-link"
              href={inv.invoicePdf}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("billing.invoices.downloadAriaLabel", {
                number: inv.number ?? inv.id,
              })}
            >
              {t("billing.invoices.pdfLink")}
            </a>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card padding="loose">
      <h3 className="portal-billing__section-title">
        {t("billing.invoices.title")}
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
          {t("billing.invoices.loadError", { error })}
        </p>
      )}

      {invoices !== null && invoices.length === 0 && !error && (
        <EmptyState
          size="compact"
          title={t("billing.invoices.emptyTitle")}
          description={t("billing.invoices.emptyDescription")}
        />
      )}

      {invoices !== null && invoices.length > 0 && (
        <>
          <Table
            className="portal-billing__flush-table"
            columns={columns}
            rows={visibleRows}
            rowKey={(inv) => inv.id}
          />
          {hasMore && (
            <div className="portal-billing__invoice-footer">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll
                  ? t("billing.invoices.showFewer", { count: DEFAULT_VISIBLE })
                  : atFetchLimit
                    ? t("billing.invoices.showMostRecent", { count: total })
                    : t("billing.invoices.showAll", { count: total })}
              </Button>
              {showAll && atFetchLimit && (
                <span className="portal-billing__invoice-note">
                  {t("billing.invoices.fetchLimitNote", { count: FETCH_LIMIT })}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
