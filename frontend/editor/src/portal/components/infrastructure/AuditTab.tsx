import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  column,
  DataTable,
  type DataTableColumn,
  type DataTableFilter,
  EmptyState,
  MetricCard,
  MetricStrip,
} from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useSectionFlags } from "@portal/hooks/useAsync";
import { useAuditLog } from "@portal/queries/infrastructure";
import { HttpError } from "@portal/api/http";
import { type AuditEvent } from "@portal/api/infrastructure";
import { AuditExportModal } from "@portal/components/infrastructure/AuditExportModal";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import {
  AUDIT_CAT_LABEL,
  AUDIT_CAT_TONE,
  AUDIT_STATUS_LABEL,
  AUDIT_TONE,
} from "@portal/components/infrastructure/infraFormat";

export function AuditTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const [exportOpen, setExportOpen] = useState(false);

  const auditFilters: DataTableFilter<AuditEvent>[] = [
    {
      key: "category",
      ariaLabel: t("portal.infrastructure.audit.filterAriaLabel"),
      options: [
        { value: "all", label: t("portal.infrastructure.audit.filters.all") },
        { value: "auth", label: t("portal.infrastructure.audit.filters.auth") },
        {
          value: "config",
          label: t("portal.infrastructure.audit.filters.config"),
        },
        {
          value: "elevation",
          label: t("portal.infrastructure.audit.filters.elevation"),
        },
        {
          value: "policy",
          label: t("portal.infrastructure.audit.filters.policy"),
        },
        {
          value: "processing",
          label: t("portal.infrastructure.audit.filters.processing"),
        },
        {
          value: "security",
          label: t("portal.infrastructure.audit.filters.security"),
        },
      ],
      predicate: (e, value) => value === "all" || e.category === value,
    },
  ];

  const cols: DataTableColumn<AuditEvent>[] = [
    column.mono({
      key: "timestamp",
      header: t("portal.infrastructure.audit.columns.timestamp"),
      sortable: true,
      get: (e) => e.timestamp,
    }),
    column.badge({
      key: "category",
      header: t("portal.infrastructure.audit.columns.event"),
      sortable: true,
      get: (e) => ({
        tone: AUDIT_CAT_TONE[e.category],
        label: t(AUDIT_CAT_LABEL[e.category]),
      }),
    }),
    column.text({
      key: "action",
      header: t("portal.infrastructure.audit.columns.action", "Action"),
      sortable: true,
      get: (e) => e.action,
    }),
    column.mono({
      key: "actor",
      header: t("portal.infrastructure.audit.columns.actor"),
      sortable: true,
      get: (e) => e.actor,
    }),
    column.text({
      key: "target",
      header: t("portal.infrastructure.audit.columns.target"),
      sortable: true,
      get: (e) => e.target,
    }),
    column.badge({
      key: "status",
      header: t("portal.infrastructure.audit.columns.status"),
      sortable: true,
      get: (e) => ({
        tone: AUDIT_TONE[e.status],
        label: t(AUDIT_STATUS_LABEL[e.status]),
      }),
    }),
    column.number({
      key: "latency",
      header: t("portal.infrastructure.audit.columns.latency"),
      sortable: true,
      get: (e) => e.latencyMs,
      format: (n) =>
        t("portal.infrastructure.audit.latencyValue", { value: n }),
    }),
  ];

  const state = useAuditLog(tier);
  const { data, error } = state;
  const { isLoading } = useSectionFlags(state);
  // Backend returns 403 for scoped-out callers; show an access message, not an empty state.
  const forbidden = error instanceof HttpError && error.status === 403;

  const rows = data?.events ?? [];

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
        <MetricStrip layout="row">
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
        </MetricStrip>
      )}

      <DataTable
        columns={cols}
        rows={rows}
        rowKey={(e) => e.id}
        loading={isLoading}
        filters={forbidden ? undefined : auditFilters}
        emptyFiltered={t("portal.infrastructure.audit.noEventsInCategory")}
        empty={
          forbidden ? (
            <EmptyState
              size="compact"
              title={t("portal.infrastructure.audit.forbidden.title")}
              description={t(
                "portal.infrastructure.audit.forbidden.description",
              )}
            />
          ) : (
            <EmptyState
              size="compact"
              title={t("portal.infrastructure.audit.empty.title")}
              description={t("portal.infrastructure.audit.empty.description")}
            />
          )
        }
      />
    </div>
  );
}
