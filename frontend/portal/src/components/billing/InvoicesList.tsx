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
  // Mirror Stripe's portal row layout: "24 Jul 2026" rather than the bare ISO.
  // Parse manually because the backend returns local datetime without a
  // timezone suffix; treating it as the local date is correct for display.
  const datePart = iso.split("T")[0];
  if (!datePart) return "—";
  const [y, m, d] = datePart.split("-").map((n) => Number(n));
  if (!y || !m || !d) return datePart;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(y, m - 1, d));
  } catch {
    return datePart;
  }
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

  // Column layout mirrors Stripe's own customer-portal "Invoice history" rows:
  //   Date · Amount · Status · Description (product name) · Actions
  // The monospace invoice id is dropped — users care about "what was it for",
  // not the internal id.
  const columns: TableColumn<Invoice>[] = [
    {
      key: "date",
      header: "Date",
      render: (inv) => formatDate(inv.createdAt),
    },
    {
      key: "amount",
      header: "Amount",
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
      key: "description",
      header: "Description",
      render: (inv) => (
        <span className="portal-billing__invoice-desc">
          {inv.description ?? "Invoice"}
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
      <h3 className="portal-billing__section-title">Invoice history</h3>

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
