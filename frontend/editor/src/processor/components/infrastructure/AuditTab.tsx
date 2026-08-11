import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  EmptyState,
  MetricCard,
  MetricStrip,
  StatusBadge,
  Table,
  Tabs,
  type TabItem,
  type TableColumn,
} from "@app/ui";
import { useTier } from "@processor/contexts/TierContext";
import { useSectionFlags } from "@processor/hooks/useAsync";
import { useAuditLog } from "@processor/queries/infrastructure";
import { HttpError } from "@processor/api/http";
import {
  type AuditCategory,
  type AuditEvent,
} from "@processor/api/infrastructure";
import { AuditExportModal } from "@processor/components/infrastructure/AuditExportModal";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";
import { TableSkeleton } from "@processor/components/infrastructure/TableSkeleton";
import {
  AUDIT_CAT_LABEL,
  AUDIT_CAT_TONE,
  AUDIT_STATUS_LABEL,
  AUDIT_TONE,
} from "@processor/components/infrastructure/infraFormat";

type AuditFilter = "all" | AuditCategory;

export function AuditTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [exportOpen, setExportOpen] = useState(false);

  const auditFilters: TabItem<AuditFilter>[] = [
    { key: "all", label: t("processor.infrastructure.audit.filters.all") },
    { key: "auth", label: t("processor.infrastructure.audit.filters.auth") },
    {
      key: "config",
      label: t("processor.infrastructure.audit.filters.config"),
    },
    {
      key: "elevation",
      label: t("processor.infrastructure.audit.filters.elevation"),
    },
    {
      key: "policy",
      label: t("processor.infrastructure.audit.filters.policy"),
    },
    {
      key: "processing",
      label: t("processor.infrastructure.audit.filters.processing"),
    },
    {
      key: "security",
      label: t("processor.infrastructure.audit.filters.security"),
    },
  ];

  const cols: TableColumn<AuditEvent>[] = [
    {
      key: "timestamp",
      header: t("processor.infrastructure.audit.columns.timestamp"),
      render: (e) => (
        <span className="processor-infra__mono">{e.timestamp}</span>
      ),
    },
    {
      key: "event",
      header: t("processor.infrastructure.audit.columns.event"),
      render: (e) => (
        <div className="processor-infra__event">
          <StatusBadge tone={AUDIT_CAT_TONE[e.category]} size="sm">
            {t(AUDIT_CAT_LABEL[e.category])}
          </StatusBadge>
          <span>{e.action}</span>
        </div>
      ),
    },
    {
      key: "actor",
      header: t("processor.infrastructure.audit.columns.actor"),
      render: (e) => <span className="processor-infra__mono">{e.actor}</span>,
    },
    {
      key: "target",
      header: t("processor.infrastructure.audit.columns.target"),
      render: (e) => e.target,
    },
    {
      key: "status",
      header: t("processor.infrastructure.audit.columns.status"),
      render: (e) => (
        <StatusBadge tone={AUDIT_TONE[e.status]} size="sm">
          {t(AUDIT_STATUS_LABEL[e.status])}
        </StatusBadge>
      ),
    },
    {
      key: "latency",
      header: t("processor.infrastructure.audit.columns.latency"),
      align: "right",
      render: (e) => (
        <span className="processor-infra__mono">
          {t("processor.infrastructure.audit.latencyValue", {
            value: e.latencyMs,
          })}
        </span>
      ),
    },
  ];

  const state = useAuditLog(tier);
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
    <div className="processor-infra__stack">
      <div className="processor-infra__audit-head">
        <SectionHeader
          title={t("processor.infrastructure.audit.heading")}
          sub={t("processor.infrastructure.audit.subheading")}
        />
        {/* Export is admin-only + whole-server, so only shown in the full-server view. */}
        {data?.fullServer && (
          <Button variant="secondary" onClick={() => setExportOpen(true)}>
            {t("processor.infrastructure.audit.export.open")}
          </Button>
        )}
      </div>

      <AuditExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
      />

      {data && (
        <MetricStrip layout="row">
          <MetricCard
            label={t("processor.infrastructure.audit.metrics.totalEvents")}
            value={data.summary.totalEvents.toLocaleString()}
          />
          <MetricCard
            label={t("processor.infrastructure.audit.metrics.policy")}
            value={data.summary.policy.toLocaleString()}
          />
          <MetricCard
            label={t("processor.infrastructure.audit.metrics.processing")}
            value={data.summary.processing.toLocaleString()}
          />
          <MetricCard
            label={t("processor.infrastructure.audit.metrics.config")}
            value={data.summary.config.toLocaleString()}
          />
        </MetricStrip>
      )}

      {!forbidden && (
        <Tabs<AuditFilter>
          items={auditFilters}
          activeKey={filter}
          onChange={setFilter}
          variant="pill"
          ariaLabel={t("processor.infrastructure.audit.filterAriaLabel")}
        />
      )}

      <Card padding="none">
        {isLoading && <TableSkeleton rows={6} cols={6} />}
        {!isLoading && forbidden && (
          <EmptyState
            size="compact"
            title={t("processor.infrastructure.audit.forbidden.title")}
            description={t(
              "processor.infrastructure.audit.forbidden.description",
            )}
          />
        )}
        {!isLoading && !forbidden && isEmpty && (
          <EmptyState
            size="compact"
            title={t("processor.infrastructure.audit.empty.title")}
            description={t("processor.infrastructure.audit.empty.description")}
          />
        )}
        {!isEmpty && data && (
          <Table
            columns={cols}
            rows={rows}
            rowKey={(e) => e.id}
            empty={t("processor.infrastructure.audit.noEventsInCategory")}
          />
        )}
      </Card>
    </div>
  );
}
