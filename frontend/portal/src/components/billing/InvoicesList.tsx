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
 * stripe.invoices via the Sync Engine). Empty list = no invoices yet (free
 * team, or pre-checkout). Each row deep-links to the Stripe-hosted invoice.
 */
export function InvoicesList() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchInvoices(20)
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
      render: (inv) =>
        inv.hostedInvoiceUrl ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(inv.hostedInvoiceUrl!, "_blank", "noopener,noreferrer")}
          >
            View
          </Button>
        ) : null,
    },
  ];

  return (
    <Card padding="loose">
      <span className="portal-billing__eyebrow">History</span>
      <h3 className="portal-billing__section-title">Invoices</h3>
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
        <Table
          columns={columns}
          rows={invoices}
          rowKey={(inv) => inv.id}
        />
      )}
    </Card>
  );
}
