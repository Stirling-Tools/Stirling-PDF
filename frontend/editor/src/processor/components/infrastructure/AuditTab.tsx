import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  column,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MetricCard,
  MetricStrip,
  Tabs,
  type TabItem,
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
import {
  AUDIT_CAT_LABEL,
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

  const cols: DataTableColumn<AuditEvent>[] = [
    column.mono({
      key: "timestamp",
      header: t("processor.infrastructure.audit.columns.timestamp"),
      sortable: true,
      get: (e) => e.timestamp,
    }),
    column.text({
      key: "event",
      header: t("processor.infrastructure.audit.columns.event"),
      sortable: true,
      // "Category: action" on one line - the category as a bold label, no
      // status-coloured dot. Colour is reserved for the Status column, where it
      // actually signals an outcome.
      label: (e) => t(AUDIT_CAT_LABEL[e.category]),
      get: (e) => e.action,
    }),
    column.mono({
      key: "actor",
      header: t("processor.infrastructure.audit.columns.actor"),
      sortable: true,
      get: (e) => e.actor,
    }),
    column.text({
      key: "target",
      header: t("processor.infrastructure.audit.columns.target"),
      sortable: true,
      get: (e) => e.target,
    }),
    column.badge({
      key: "status",
      header: t("processor.infrastructure.audit.columns.status"),
      sortable: true,
      get: (e) => ({
        tone: AUDIT_TONE[e.status],
        label: t(AUDIT_STATUS_LABEL[e.status]),
      }),
    }),
    column.number({
      key: "latency",
      header: t("processor.infrastructure.audit.columns.latency"),
      sortable: true,
      get: (e) => e.latencyMs,
      format: (n) =>
        t("processor.infrastructure.audit.latencyValue", { value: n }),
    }),
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

      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(e) => e.id}
        loading={isLoading}
        empty={
          forbidden ? (
            <EmptyState
              size="compact"
              title={t("processor.infrastructure.audit.forbidden.title")}
              description={t(
                "processor.infrastructure.audit.forbidden.description",
              )}
            />
          ) : isEmpty ? (
            <EmptyState
              size="compact"
              title={t("processor.infrastructure.audit.empty.title")}
              description={t(
                "processor.infrastructure.audit.empty.description",
              )}
            />
          ) : (
            t("processor.infrastructure.audit.noEventsInCategory")
          )
        }
      />
    </div>
  );
}
