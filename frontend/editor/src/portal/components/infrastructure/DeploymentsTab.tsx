import { useTranslation } from "react-i18next";
import {
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  StatusBadge,
  Table,
  type TableColumn,
} from "@app/ui";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchDeployments,
  type DeploymentsResponse,
  type DeploymentRegion,
  type RecentDeployment,
} from "@portal/api/infrastructure";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import { TableSkeleton } from "@portal/components/infrastructure/TableSkeleton";
import {
  DEPLOY_LABEL,
  DEPLOY_TONE,
  pct,
  REGION_TONE,
  titleCase,
} from "@portal/components/infrastructure/infraFormat";

export function DeploymentsTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<DeploymentsResponse>(
    () => fetchDeployments(tier),
    [tier],
  );
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const regionCols: TableColumn<DeploymentRegion>[] = [
    {
      key: "name",
      header: t("portal.infrastructure.deployments.regionColumns.region"),
      render: (r) => (
        <div className="portal-infra__cell-stack">
          <span className="portal-infra__cell-strong">{r.name}</span>
          <code className="portal-infra__cell-code">{r.code}</code>
        </div>
      ),
    },
    {
      key: "latency",
      header: t("portal.infrastructure.deployments.regionColumns.latency"),
      align: "right",
      render: (r) => (
        <span className="portal-infra__mono">
          {t("portal.infrastructure.deployments.msValue", {
            value: r.latencyMs,
          })}
        </span>
      ),
    },
    {
      key: "load",
      header: t("portal.infrastructure.deployments.regionColumns.load"),
      width: "9rem",
      render: (r) => (
        <div className="portal-infra__load">
          <ProgressBar value={r.load} thresholded height={6} />
          <span className="portal-infra__load-pct">{pct(r.load)}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: t("portal.infrastructure.deployments.regionColumns.status"),
      render: (r) => (
        <StatusBadge
          tone={REGION_TONE[r.status]}
          size="sm"
          pulse={r.status === "healthy"}
        >
          {titleCase(r.status)}
        </StatusBadge>
      ),
    },
    {
      key: "version",
      header: t("portal.infrastructure.deployments.regionColumns.version"),
      render: (r) => (
        <code className="portal-infra__cell-code">{r.version}</code>
      ),
    },
    {
      key: "uptime",
      header: t("portal.infrastructure.deployments.regionColumns.uptime"),
      align: "right",
      render: (r) => (
        <span className="portal-infra__mono">{pct(r.uptime, 3)}</span>
      ),
    },
    {
      key: "instances",
      header: t("portal.infrastructure.deployments.regionColumns.instances"),
      align: "right",
      render: (r) => <span className="portal-infra__mono">{r.instances}</span>,
    },
    {
      key: "throughput",
      header: t("portal.infrastructure.deployments.regionColumns.throughput"),
      align: "right",
      render: (r) => (
        <span className="portal-infra__mono">
          {t("portal.infrastructure.deployments.throughputValue", {
            value: r.throughput.toLocaleString(),
          })}
        </span>
      ),
    },
    {
      key: "p99",
      header: t("portal.infrastructure.deployments.regionColumns.p99"),
      align: "right",
      render: (r) => (
        <span className="portal-infra__mono">
          {t("portal.infrastructure.deployments.msValue", { value: r.p99Ms })}
        </span>
      ),
    },
  ];

  const deployCols: TableColumn<RecentDeployment>[] = [
    {
      key: "version",
      header: t("portal.infrastructure.deployments.deployColumns.version"),
      render: (d) => (
        <code className="portal-infra__cell-code">{d.version}</code>
      ),
    },
    {
      key: "environment",
      header: t("portal.infrastructure.deployments.deployColumns.environment"),
      render: (d) => (
        <Chip
          tone={
            d.environment === "production"
              ? "blue"
              : d.environment === "canary"
                ? "purple"
                : "neutral"
          }
          size="sm"
        >
          {d.environment}
        </Chip>
      ),
    },
    {
      key: "product",
      header: t("portal.infrastructure.deployments.deployColumns.product"),
      render: (d) => d.product,
    },
    {
      key: "status",
      header: t("portal.infrastructure.deployments.deployColumns.status"),
      render: (d) => (
        <StatusBadge tone={DEPLOY_TONE[d.status]} size="sm">
          {DEPLOY_LABEL[d.status]}
        </StatusBadge>
      ),
    },
    {
      key: "deployedBy",
      header: t("portal.infrastructure.deployments.deployColumns.deployedBy"),
      render: (d) => <span className="portal-infra__mono">{d.deployedBy}</span>,
    },
    {
      key: "timestamp",
      header: t("portal.infrastructure.deployments.deployColumns.when"),
      align: "right",
      render: (d) => <span className="portal-infra__muted">{d.timestamp}</span>,
    },
  ];

  return (
    <div className="portal-infra__stack">
      <section>
        <SectionHeader
          title={t("portal.infrastructure.deployments.regions.heading")}
          sub={t("portal.infrastructure.deployments.regions.subheading")}
        />
        <Card padding="none">
          {isLoading && <TableSkeleton rows={3} cols={9} />}
          {isEmpty && (
            <EmptyState
              size="compact"
              title={t("portal.infrastructure.deployments.regions.empty.title")}
              description={t(
                "portal.infrastructure.deployments.regions.empty.description",
              )}
            />
          )}
          {!isEmpty && data && data.regions.length > 0 && (
            <Table
              columns={regionCols}
              rows={data.regions}
              rowKey={(r) => r.code}
            />
          )}
        </Card>
      </section>

      <section>
        <SectionHeader
          title={t("portal.infrastructure.deployments.recent.heading")}
          sub={t("portal.infrastructure.deployments.recent.subheading")}
        />
        <Card padding="none">
          {isLoading && <TableSkeleton rows={4} cols={6} />}
          {data && data.recent.length > 0 && (
            <Table
              columns={deployCols}
              rows={data.recent}
              rowKey={(d) => d.id}
            />
          )}
        </Card>
      </section>
    </div>
  );
}
