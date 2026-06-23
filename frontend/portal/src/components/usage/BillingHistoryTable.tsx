import { useTranslation } from "react-i18next";
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

/** Invoice / line-item history for the current and prior billing cycles. */
export function BillingHistoryTable() {
  const { t } = useTranslation();
  const { tier } = useTier();

  const statusLabel: Record<InvoiceStatus, string> = {
    paid: t("usage.history.status.paid"),
    due: t("usage.history.status.due"),
    pending: t("usage.history.status.pending"),
    refunded: t("usage.history.status.refunded"),
  };
  const state = useAsync<BillingHistoryRow[]>(
    () => fetchBillingHistory(tier),
    [tier],
  );
  const { data: rows } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const columns: TableColumn<BillingHistoryRow>[] = [
    {
      key: "date",
      header: t("usage.history.columns.date"),
      render: (r) => (
        <span className="portal-usage__hist-date">
          {formatBillingDate(r.date)}
        </span>
      ),
      width: "9rem",
    },
    {
      key: "description",
      header: t("usage.history.columns.description"),
      render: (r) => r.description,
    },
    {
      key: "docs",
      header: t("usage.history.columns.docs"),
      align: "right",
      render: (r) => (r.docs > 0 ? r.docs.toLocaleString() : "—"),
      width: "8rem",
    },
    {
      key: "amount",
      header: t("usage.history.columns.amount"),
      align: "right",
      render: (r) => (
        <span
          className={
            r.amount < 0
              ? "portal-usage__hist-credit"
              : "portal-usage__hist-amount"
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
      header: t("usage.history.columns.status"),
      align: "right",
      render: (r) => (
        <StatusBadge tone={STATUS_TONE[r.status]} size="sm">
          {statusLabel[r.status]}
        </StatusBadge>
      ),
      width: "8rem",
    },
  ];

  return (
    <section className="portal-usage__hist-block">
      <header className="portal-usage__section-head">
        <h2 className="portal-usage__section-title">
          {t("usage.history.title")}
        </h2>
        <p className="portal-usage__section-sub">
          {t("usage.history.subtitle")}
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
          title={t("usage.history.empty.title")}
          description={t("usage.history.empty.description")}
        />
      )}

      {rows && rows.length > 0 && (
        <Card padding="none">
          <Table
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            empty={t("usage.history.emptyRows")}
          />
        </Card>
      )}
    </section>
  );
}
