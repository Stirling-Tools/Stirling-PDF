import {
  Card,
  EmptyState,
  Skeleton,
  StatusBadge,
  Table,
  type StatusTone,
  type TableColumn,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchBillingHistory,
  type BillingHistoryRow,
  type InvoiceStatus,
} from "@portal/api/usage";
import { USD, formatBillingDate } from "@portal/components/usage/format";
import "@portal/views/Usage.css";

const STATUS_TONE: Record<InvoiceStatus, StatusTone> = {
  paid: "success",
  due: "warning",
  pending: "info",
  refunded: "neutral",
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Paid",
  due: "Due",
  pending: "Pending",
  refunded: "Refunded",
};

/** Invoice / line-item history for the current and prior billing cycles. */
export function BillingHistoryTable() {
  const { tier } = useTier();
  const state = useAsync<BillingHistoryRow[]>(
    () => fetchBillingHistory(tier),
    [tier],
  );
  const { data: rows } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const columns: TableColumn<BillingHistoryRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (r) => (
        <span className="portal-usage__hist-date">{formatBillingDate(r.date)}</span>
      ),
      width: "9rem",
    },
    {
      key: "description",
      header: "Description",
      render: (r) => r.description,
    },
    {
      key: "docs",
      header: "Docs",
      align: "right",
      render: (r) => (r.docs > 0 ? r.docs.toLocaleString() : "—"),
      width: "8rem",
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => (
        <span
          className={
            r.amount < 0 ? "portal-usage__hist-credit" : "portal-usage__hist-amount"
          }
        >
          {r.amount < 0
            ? `−${USD.format(Math.abs(r.amount))}`
            : USD.format(r.amount)}
        </span>
      ),
      width: "8rem",
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status]} size="sm">
          {STATUS_LABEL[r.status]}
        </StatusBadge>
      ),
      width: "8rem",
    },
  ];

  return (
    <section className="portal-usage__hist-block">
      <header className="portal-usage__section-head">
        <h2 className="portal-usage__section-title">Billing history</h2>
        <p className="portal-usage__section-sub">
          Line items from the current and prior billing cycles.
        </p>
      </header>

      {isLoading && (
        <div className="portal-usage__hist-skeleton" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="2.5rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          size="compact"
          title="No billing history"
          description="Charges and credits appear here once your first cycle closes."
        />
      )}

      {rows && rows.length > 0 && (
        <Card padding="none">
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            empty="No line items"
          />
        </Card>
      )}
    </section>
  );
}
