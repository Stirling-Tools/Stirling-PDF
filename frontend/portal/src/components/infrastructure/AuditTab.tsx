import { useMemo, useState } from "react";
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

const AUDIT_FILTERS: TabItem<AuditFilter>[] = [
  { key: "all", label: "All" },
  { key: "auth", label: "Auth" },
  { key: "config", label: "Config" },
  { key: "elevation", label: "Elevation" },
  { key: "processing", label: "Processing" },
  { key: "security", label: "Security" },
];

const cols: TableColumn<AuditEvent>[] = [
  {
    key: "timestamp",
    header: "Timestamp",
    render: (e) => <span className="portal-infra__mono">{e.timestamp}</span>,
  },
  {
    key: "event",
    header: "Event",
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
    header: "Actor",
    render: (e) => <span className="portal-infra__mono">{e.actor}</span>,
  },
  { key: "target", header: "Target", render: (e) => e.target },
  {
    key: "status",
    header: "Status",
    render: (e) => (
      <StatusBadge tone={AUDIT_TONE[e.status]} size="sm">
        {titleCase(e.status)}
      </StatusBadge>
    ),
  },
  {
    key: "latency",
    header: "Latency",
    align: "right",
    render: (e) => <span className="portal-infra__mono">{e.latencyMs} ms</span>,
  },
];

export function AuditTab() {
  const { tier } = useTier();
  const [filter, setFilter] = useState<AuditFilter>("all");
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
        title="Audit logs"
        sub="Every authentication, configuration, and processing event across your workspace."
      />

      {data && (
        <section className="portal-infra__metrics">
          <MetricCard
            label="Total events · 24h"
            value={data.summary.totalEvents.toLocaleString()}
          />
          <MetricCard
            label="Processing"
            value={data.summary.processing.toLocaleString()}
          />
          <MetricCard
            label="Elevation"
            value={data.summary.elevation.toLocaleString()}
          />
          <MetricCard
            label="Config"
            value={data.summary.config.toLocaleString()}
          />
        </section>
      )}

      <Tabs<AuditFilter>
        items={AUDIT_FILTERS}
        activeKey={filter}
        onChange={setFilter}
        variant="pill"
        ariaLabel="Filter audit events by category"
      />

      <Card padding="none">
        {isLoading && <TableSkeleton rows={6} cols={6} />}
        {isEmpty && (
          <EmptyState
            size="compact"
            title="No audit events"
            description="Workspace activity will appear here as it happens."
          />
        )}
        {!isEmpty && data && (
          <Table
            columns={cols}
            rows={rows}
            rowKey={(e) => e.id}
            empty="No events in this category."
          />
        )}
      </Card>
    </div>
  );
}
