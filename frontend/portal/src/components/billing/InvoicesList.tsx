import { useEffect, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  Skeleton,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
import { fetchInvoices, type Invoice } from "@portal/api/billing";

const DEFAULT_VISIBLE = 5;
/** Fetch a few more than DEFAULT_VISIBLE so "Show more" actually has something to show. */
const FETCH_LIMIT = 20;

function formatMoney(minor: number | null, currency: string | null): string {
  if (minor == null) return "—";
  const code = (currency ?? "usd").toUpperCase();
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: code,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${code}`;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  // ISO local datetime from the backend; trim to date for the table.
  const d = iso.split("T")[0];
  return d ?? "—";
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
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

  const columns: TableColumn<Invoice>[] = [
    {
      key: "number",
      header: "Invoice",
      render: (inv) => (
        <span className="portal-billing__invoice-num">
          {inv.number ?? inv.id}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (inv) => formatDate(inv.createdAt),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (inv) => formatMoney(inv.totalMinor, inv.currency),
    },
    {
      key: "status",
      header: "Status",
      render: (inv) => (
        <StatusBadge tone={statusTone(inv.status)} size="sm">
          {inv.status}
        </StatusBadge>
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
              aria-label={`View invoice ${inv.number ?? inv.id} in Stripe`}
            >
              View ↗
            </a>
          )}
          {inv.invoicePdf && (
            <a
              className="portal-billing__invoice-link"
              href={inv.invoicePdf}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Download invoice ${inv.number ?? inv.id} as PDF`}
            >
              PDF ↓
            </a>
          )}
        </div>
      ),
    },
  ];

  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">History</span>
      <h3 className="portal-billing__section-title">Invoices</h3>
      <p className="portal-billing__section-sub">
        Newest first. For older invoices, open the Stripe customer portal from
        the Subscription card above.
      </p>

      {invoices === null && !error && (
        <div className="portal-billing__skeleton" aria-hidden>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </div>
      )}

      {error && (
        <p className="portal-billing__error" role="alert">
          Couldn't load invoices: {error}
        </p>
      )}

      {invoices !== null && invoices.length === 0 && !error && (
        <EmptyState
          size="compact"
          title="No invoices yet"
          description="Once your team subscribes and the first cycle closes, your invoices appear here."
        />
      )}

      {invoices !== null && invoices.length > 0 && (
        <>
          <Table
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
                  ? `Show fewer (top ${DEFAULT_VISIBLE})`
                  : `Show all ${total}`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
