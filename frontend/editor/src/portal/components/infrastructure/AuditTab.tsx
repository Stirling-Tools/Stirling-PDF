import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  EmptyState,
  MetricCard,
  StatusBadge,
  Table,
  Tabs,
  type TabItem,
  type TableColumn,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchAuditLog,
  type AuditCategory,
  type AuditEvent,
  type AuditLogResponse,
} from "@portal/api/infrastructure";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import { TableSkeleton } from "@portal/components/infrastructure/TableSkeleton";
import {
  AUDIT_CAT_LABEL,
  AUDIT_CAT_TONE,
  AUDIT_TONE,
  titleCase,
} from "@portal/components/infrastructure/infraFormat";

type AuditFilter = "all" | AuditCategory;

export function AuditTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [filter, setFilter] = useState<AuditFilter>("all");

  const auditFilters: TabItem<AuditFilter>[] = [
    { key: "all", label: t("infrastructure.audit.filters.all") },
    { key: "auth", label: t("infrastructure.audit.filters.auth") },
    { key: "config", label: t("infrastructure.audit.filters.config") },
    { key: "elevation", label: t("infrastructure.audit.filters.elevation") },
    { key: "processing", label: t("infrastructure.audit.filters.processing") },
    { key: "security", label: t("infrastructure.audit.filters.security") },
  ];

  const cols: TableColumn<AuditEvent>[] = [
    {
      key: "timestamp",
      header: t("infrastructure.audit.columns.timestamp"),
      render: (e) => <span className="portal-infra__mono">{e.timestamp}</span>,
    },
    {
      key: "event",
      header: t("infrastructure.audit.columns.event"),
      render: (e) => (
        <div className="portal-infra__event">
          <StatusBadge tone={AUDIT_CAT_TONE[e.category]} size="sm">
            {AUDIT_CAT_LABEL[e.category]}
          </StatusBadge>
          <span>{e.action}</span>
        </div>
      ),
    },
    {
      key: "actor",
      header: t("infrastructure.audit.columns.actor"),
      render: (e) => <span className="portal-infra__mono">{e.actor}</span>,
    },
    {
      key: "target",
      header: t("infrastructure.audit.columns.target"),
      render: (e) => e.target,
    },
    {
      key: "status",
      header: t("infrastructure.audit.columns.status"),
      render: (e) => (
        <StatusBadge tone={AUDIT_TONE[e.status]} size="sm">
          {titleCase(e.status)}
        </StatusBadge>
      ),
    },
    {
      key: "latency",
      header: t("infrastructure.audit.columns.latency"),
      align: "right",
      render: (e) => (
        <span className="portal-infra__mono">
          {t("infrastructure.audit.latencyValue", { value: e.latencyMs })}
        </span>
      ),
    },
  ];

  const state = useAsync<AuditLogResponse>(() => fetchAuditLog(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const rows = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.events;
    return data.events.filter((e) => e.category === filter);
  }, [data, filter]);

  return (
    <div className="portal-infra__stack">
      <SectionHeader
        title={t("infrastructure.audit.heading")}
        sub={t("infrastructure.audit.subheading")}
      />

      {data && (
        <section className="portal-infra__metrics">
          <MetricCard
            label={t("infrastructure.audit.metrics.totalEvents")}
            value={data.summary.totalEvents.toLocaleString()}
          />
          <MetricCard
            label={t("infrastructure.audit.metrics.processing")}
            value={data.summary.processing.toLocaleString()}
          />
          <MetricCard
            label={t("infrastructure.audit.metrics.elevation")}
            value={data.summary.elevation.toLocaleString()}
          />
          <MetricCard
            label={t("infrastructure.audit.metrics.config")}
            value={data.summary.config.toLocaleString()}
          />
        </section>
      )}

      <Tabs<AuditFilter>
        items={auditFilters}
        activeKey={filter}
        onChange={setFilter}
        variant="pill"
        ariaLabel={t("infrastructure.audit.filterAriaLabel")}
      />

      <Card padding="none">
        {isLoading && <TableSkeleton rows={6} cols={6} />}
        {isEmpty && (
          <EmptyState
            size="compact"
            title={t("infrastructure.audit.empty.title")}
            description={t("infrastructure.audit.empty.description")}
          />
        )}
        {!isEmpty && data && (
          <Table
            columns={cols}
            rows={rows}
            rowKey={(e) => e.id}
            empty={t("infrastructure.audit.noEventsInCategory")}
          />
        )}
      </Card>
    </div>
  );
}
