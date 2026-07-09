import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  MetricCard,
  StatusBadge,
  Table,
  Tabs,
  type TabItem,
  type TableColumn,
} from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { HttpError } from "@portal/api/http";
import {
  fetchAuditLog,
  type AuditCategory,
  type AuditEvent,
  type AuditLogResponse,
} from "@portal/api/infrastructure";
import { AuditExportModal } from "@portal/components/infrastructure/AuditExportModal";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import { TableSkeleton } from "@portal/components/infrastructure/TableSkeleton";
import {
  AUDIT_CAT_LABEL,
  AUDIT_CAT_TONE,
  AUDIT_STATUS_LABEL,
  AUDIT_TONE,
} from "@portal/components/infrastructure/infraFormat";

type AuditFilter = "all" | AuditCategory;

export function AuditTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [exportOpen, setExportOpen] = useState(false);

  const auditFilters: TabItem<AuditFilter>[] = [
    { key: "all", label: t("portal.infrastructure.audit.filters.all") },
    { key: "auth", label: t("portal.infrastructure.audit.filters.auth") },
    { key: "config", label: t("portal.infrastructure.audit.filters.config") },
    {
      key: "elevation",
      label: t("portal.infrastructure.audit.filters.elevation"),
    },
    { key: "policy", label: t("portal.infrastructure.audit.filters.policy") },
    {
      key: "processing",
      label: t("portal.infrastructure.audit.filters.processing"),
    },
    {
      key: "security",
      label: t("portal.infrastructure.audit.filters.security"),
    },
  ];

  const cols: TableColumn<AuditEvent>[] = [
    {
      key: "timestamp",
      header: t("portal.infrastructure.audit.columns.timestamp"),
      render: (e) => <span className="portal-infra__mono">{e.timestamp}</span>,
    },
    {
      key: "event",
      header: t("portal.infrastructure.audit.columns.event"),
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
      header: t("portal.infrastructure.audit.columns.actor"),
      render: (e) => <span className="portal-infra__mono">{e.actor}</span>,
    },
    {
      key: "target",
      header: t("portal.infrastructure.audit.columns.target"),
      render: (e) => e.target,
    },
    {
      key: "status",
      header: t("portal.infrastructure.audit.columns.status"),
      render: (e) => (
        <StatusBadge tone={AUDIT_TONE[e.status]} size="sm">
          {AUDIT_STATUS_LABEL[e.status]}
        </StatusBadge>
      ),
    },
    {
      key: "latency",
      header: t("portal.infrastructure.audit.columns.latency"),
      align: "right",
      render: (e) => (
        <span className="portal-infra__mono">
          {t("portal.infrastructure.audit.latencyValue", {
            value: e.latencyMs,
          })}
        </span>
      ),
    },
  ];

  const state = useAsync<AuditLogResponse>(() => fetchAuditLog(tier), [tier]);
  const { data, error } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);
  // Backend returns 403 for scoped-out callers; show an access message, not an empty state.
  const forbidden = error instanceof HttpError && error.status === 403;

  const rows = useMemo(() => {
    if (!data) return [];
    if (filter === "all") return data.events;
    return data.events.filter((e) => e.category === filter);
  }, [data, filter]);

  return (
    <div className="portal-infra__stack">
      <div className="portal-infra__audit-head">
        <SectionHeader
          title={t("portal.infrastructure.audit.heading")}
          sub={t("portal.infrastructure.audit.subheading")}
        />
        {/* Export is admin-only + whole-server, so only shown in the full-server view. */}
        {data?.fullServer && (
          <Button variant="secondary" onClick={() => setExportOpen(true)}>
            {t("portal.infrastructure.audit.export.open")}
          </Button>
        )}
      </div>

      <AuditExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />

      {data && (
        <section className="portal-infra__metrics">
          <MetricCard
            label={t("portal.infrastructure.audit.metrics.totalEvents")}
            value={data.summary.totalEvents.toLocaleString()}
          />
          <MetricCard
            label={t("portal.infrastructure.audit.metrics.policy")}
            value={data.summary.policy.toLocaleString()}
          />
          <MetricCard
            label={t("portal.infrastructure.audit.metrics.processing")}
            value={data.summary.processing.toLocaleString()}
          />
          <MetricCard
            label={t("portal.infrastructure.audit.metrics.config")}
            value={data.summary.config.toLocaleString()}
          />
        </section>
      )}

      {!forbidden && (
        <Tabs<AuditFilter>
          items={auditFilters}
          activeKey={filter}
          onChange={setFilter}
          variant="pill"
          ariaLabel={t("portal.infrastructure.audit.filterAriaLabel")}
        />
      )}

      <Card padding="none">
        {isLoading && <TableSkeleton rows={6} cols={6} />}
        {!isLoading && forbidden && (
          <EmptyState
            size="compact"
            title={t("portal.infrastructure.audit.forbidden.title")}
            description={t("portal.infrastructure.audit.forbidden.description")}
          />
        )}
        {!isLoading && !forbidden && isEmpty && (
          <EmptyState
            size="compact"
            title={t("portal.infrastructure.audit.empty.title")}
            description={t("portal.infrastructure.audit.empty.description")}
          />
        )}
        {!isEmpty && data && (
          <Table
            columns={cols}
            rows={rows}
            rowKey={(e) => e.id}
            empty={t("portal.infrastructure.audit.noEventsInCategory")}
          />
        )}
      </Card>
    </div>
  );
}
