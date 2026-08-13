import { useTranslation } from "react-i18next";
import { column, DataTable, type DataTableColumn, EmptyState } from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchDeployments,
  type DeploymentsResponse,
  type DeploymentRegion,
  type RecentDeployment,
} from "@portal/api/infrastructure";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import {
  DEPLOY_LABEL,
  DEPLOY_TONE,
  pct,
  REGION_LABEL,
  REGION_TONE,
} from "@portal/components/infrastructure/infraFormat";

export function DeploymentsTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<DeploymentsResponse>(
    () => fetchDeployments(tier),
    [tier],
  );
  const { data } = state;
  const { isLoading } = useSectionFlags(state);

  const regionCols: DataTableColumn<DeploymentRegion>[] = [
    column.entity({
      key: "name",
      header: t("portal.infrastructure.deployments.regionColumns.region"),
      sortable: true,
      primary: (r) => r.name,
      note: (r) => r.code,
    }),
    column.number({
      key: "latency",
      header: t("portal.infrastructure.deployments.regionColumns.latency"),
      sortable: true,
      get: (r) => r.latencyMs,
      format: (n) =>
        t("portal.infrastructure.deployments.msValue", { value: n }),
    }),
    column.progress({
      key: "load",
      header: t("portal.infrastructure.deployments.regionColumns.load"),
      sortable: true,
      get: (r) => ({ value: r.load, label: pct(r.load) }),
      ariaLabel: (r) =>
        t("portal.infrastructure.deployments.loadAria", { name: r.name }),
    }),
    column.badge({
      key: "status",
      header: t("portal.infrastructure.deployments.regionColumns.status"),
      sortable: true,
      get: (r) => ({
        tone: REGION_TONE[r.status],
        label: t(REGION_LABEL[r.status]),
      }),
    }),
    column.mono({
      key: "version",
      header: t("portal.infrastructure.deployments.regionColumns.version"),
      sortable: true,
      get: (r) => r.version,
    }),
    column.number({
      key: "uptime",
      header: t("portal.infrastructure.deployments.regionColumns.uptime"),
      sortable: true,
      get: (r) => r.uptime,
      format: (n) => pct(n, 3),
    }),
    column.number({
      key: "instances",
      header: t("portal.infrastructure.deployments.regionColumns.instances"),
      sortable: true,
      get: (r) => r.instances,
    }),
    column.number({
      key: "throughput",
      header: t("portal.infrastructure.deployments.regionColumns.throughput"),
      sortable: true,
      get: (r) => r.throughput,
      format: (n) =>
        t("portal.infrastructure.deployments.throughputValue", {
          value: n.toLocaleString(),
        }),
    }),
    column.number({
      key: "p99",
      header: t("portal.infrastructure.deployments.regionColumns.p99"),
      sortable: true,
      get: (r) => r.p99Ms,
      format: (n) =>
        t("portal.infrastructure.deployments.msValue", { value: n }),
    }),
  ];

  const deployCols: DataTableColumn<RecentDeployment>[] = [
    column.mono({
      key: "version",
      header: t("portal.infrastructure.deployments.deployColumns.version"),
      sortable: true,
      get: (d) => d.version,
    }),
    column.text({
      key: "environment",
      header: t("portal.infrastructure.deployments.deployColumns.environment"),
      sortable: true,
      get: (d) =>
        d.environment.charAt(0).toUpperCase() + d.environment.slice(1),
    }),
    column.text({
      key: "product",
      header: t("portal.infrastructure.deployments.deployColumns.product"),
      sortable: true,
      get: (d) => d.product,
    }),
    column.badge({
      key: "status",
      header: t("portal.infrastructure.deployments.deployColumns.status"),
      sortable: true,
      get: (d) => ({
        tone: DEPLOY_TONE[d.status],
        label: t(DEPLOY_LABEL[d.status]),
      }),
    }),
    column.mono({
      key: "deployedBy",
      header: t("portal.infrastructure.deployments.deployColumns.deployedBy"),
      sortable: true,
      get: (d) => d.deployedBy,
    }),
    column.muted({
      key: "timestamp",
      header: t("portal.infrastructure.deployments.deployColumns.when"),
      get: (d) => d.timestamp,
    }),
  ];

  return (
    <div className="portal-infra__stack">
      <section>
        <SectionHeader
          title={t("portal.infrastructure.deployments.regions.heading")}
          sub={t("portal.infrastructure.deployments.regions.subheading")}
        />
        <DataTable
          columns={regionCols}
          rows={data?.regions ?? []}
          rowKey={(r) => r.code}
          loading={isLoading}
          empty={
            <EmptyState
              size="compact"
              title={t("portal.infrastructure.deployments.regions.empty.title")}
              description={t(
                "portal.infrastructure.deployments.regions.empty.description",
              )}
            />
          }
        />
      </section>

      <section>
        <SectionHeader
          title={t("portal.infrastructure.deployments.recent.heading")}
          sub={t("portal.infrastructure.deployments.recent.subheading")}
        />
        <DataTable
          columns={deployCols}
          rows={data?.recent ?? []}
          rowKey={(d) => d.id}
          loading={isLoading}
          empty={t(
            "portal.infrastructure.deployments.recent.empty",
            "No recent deployments",
          )}
        />
      </section>
    </div>
  );
}
