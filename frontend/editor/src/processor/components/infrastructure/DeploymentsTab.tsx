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
import { useTier } from "@processor/contexts/TierContext";
import { useAsync, useSectionFlags } from "@processor/hooks/useAsync";
import {
  fetchDeployments,
  type DeploymentsResponse,
  type DeploymentRegion,
  type RecentDeployment,
} from "@processor/api/infrastructure";
import { SectionHeader } from "@processor/components/infrastructure/SectionHeader";
import { TableSkeleton } from "@processor/components/infrastructure/TableSkeleton";
import {
  DEPLOY_LABEL,
  DEPLOY_TONE,
  pct,
  REGION_LABEL,
  REGION_TONE,
} from "@processor/components/infrastructure/infraFormat";

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
      header: t("processor.infrastructure.deployments.regionColumns.region"),
      render: (r) => (
        <div className="processor-infra__cell-stack">
          <span className="processor-infra__cell-strong">{r.name}</span>
          <code className="processor-infra__cell-code">{r.code}</code>
        </div>
      ),
    },
    {
      key: "latency",
      header: t("processor.infrastructure.deployments.regionColumns.latency"),
      align: "right",
      render: (r) => (
        <span className="processor-infra__mono">
          {t("processor.infrastructure.deployments.msValue", {
            value: r.latencyMs,
          })}
        </span>
      ),
    },
    {
      key: "load",
      header: t("processor.infrastructure.deployments.regionColumns.load"),
      width: "9rem",
      render: (r) => (
        <div className="processor-infra__load">
          <ProgressBar
            value={r.load}
            thresholded
            height={6}
            label={t("processor.infrastructure.deployments.loadAria", {
              name: r.name,
            })}
          />
          <span className="processor-infra__load-pct">{pct(r.load)}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: t("processor.infrastructure.deployments.regionColumns.status"),
      render: (r) => (
        <StatusBadge tone={REGION_TONE[r.status]} size="sm">
          {t(REGION_LABEL[r.status])}
        </StatusBadge>
      ),
    },
    {
      key: "version",
      header: t("processor.infrastructure.deployments.regionColumns.version"),
      render: (r) => (
        <code className="processor-infra__cell-code">{r.version}</code>
      ),
    },
    {
      key: "uptime",
      header: t("processor.infrastructure.deployments.regionColumns.uptime"),
      align: "right",
      render: (r) => (
        <span className="processor-infra__mono">{pct(r.uptime, 3)}</span>
      ),
    },
    {
      key: "instances",
      header: t("processor.infrastructure.deployments.regionColumns.instances"),
      align: "right",
      render: (r) => (
        <span className="processor-infra__mono">{r.instances}</span>
      ),
    },
    {
      key: "throughput",
      header: t(
        "processor.infrastructure.deployments.regionColumns.throughput",
      ),
      align: "right",
      render: (r) => (
        <span className="processor-infra__mono">
          {t("processor.infrastructure.deployments.throughputValue", {
            value: r.throughput.toLocaleString(),
          })}
        </span>
      ),
    },
    {
      key: "p99",
      header: t("processor.infrastructure.deployments.regionColumns.p99"),
      align: "right",
      render: (r) => (
        <span className="processor-infra__mono">
          {t("processor.infrastructure.deployments.msValue", {
            value: r.p99Ms,
          })}
        </span>
      ),
    },
  ];

  const deployCols: TableColumn<RecentDeployment>[] = [
    {
      key: "version",
      header: t("processor.infrastructure.deployments.deployColumns.version"),
      render: (d) => (
        <code className="processor-infra__cell-code">{d.version}</code>
      ),
    },
    {
      key: "environment",
      header: t(
        "processor.infrastructure.deployments.deployColumns.environment",
      ),
      render: (d) => (
        <Chip
          accent={
            d.environment === "production"
              ? "default"
              : d.environment === "canary"
                ? "premium"
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
      header: t("processor.infrastructure.deployments.deployColumns.product"),
      render: (d) => d.product,
    },
    {
      key: "status",
      header: t("processor.infrastructure.deployments.deployColumns.status"),
      render: (d) => (
        <StatusBadge tone={DEPLOY_TONE[d.status]} size="sm">
          {t(DEPLOY_LABEL[d.status])}
        </StatusBadge>
      ),
    },
    {
      key: "deployedBy",
      header: t(
        "processor.infrastructure.deployments.deployColumns.deployedBy",
      ),
      render: (d) => (
        <span className="processor-infra__mono">{d.deployedBy}</span>
      ),
    },
    {
      key: "timestamp",
      header: t("processor.infrastructure.deployments.deployColumns.when"),
      align: "right",
      render: (d) => (
        <span className="processor-infra__muted">{d.timestamp}</span>
      ),
    },
  ];

  return (
    <div className="processor-infra__stack">
      <section>
        <SectionHeader
          title={t("processor.infrastructure.deployments.regions.heading")}
          sub={t("processor.infrastructure.deployments.regions.subheading")}
        />
        <Card padding="none">
          {isLoading && <TableSkeleton rows={3} cols={9} />}
          {isEmpty && (
            <EmptyState
              size="compact"
              title={t(
                "processor.infrastructure.deployments.regions.empty.title",
              )}
              description={t(
                "processor.infrastructure.deployments.regions.empty.description",
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
          title={t("processor.infrastructure.deployments.recent.heading")}
          sub={t("processor.infrastructure.deployments.recent.subheading")}
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
