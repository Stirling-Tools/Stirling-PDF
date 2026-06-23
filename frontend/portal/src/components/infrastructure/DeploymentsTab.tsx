import {
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  StatusBadge,
  Table,
  type TableColumn,
} from "@shared/components";
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

const regionCols: TableColumn<DeploymentRegion>[] = [
  {
    key: "name",
    header: "Region",
    render: (r) => (
      <div className="portal-infra__cell-stack">
        <span className="portal-infra__cell-strong">{r.name}</span>
        <code className="portal-infra__cell-code">{r.code}</code>
      </div>
    ),
  },
  {
    key: "latency",
    header: "Latency",
    align: "right",
    render: (r) => <span className="portal-infra__mono">{r.latencyMs} ms</span>,
  },
  {
    key: "load",
    header: "Load",
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
    header: "Status",
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
    header: "Version",
    render: (r) => <code className="portal-infra__cell-code">{r.version}</code>,
  },
  {
    key: "uptime",
    header: "Uptime",
    align: "right",
    render: (r) => (
      <span className="portal-infra__mono">{pct(r.uptime, 3)}</span>
    ),
  },
  {
    key: "instances",
    header: "Instances",
    align: "right",
    render: (r) => <span className="portal-infra__mono">{r.instances}</span>,
  },
  {
    key: "throughput",
    header: "Throughput",
    align: "right",
    render: (r) => (
      <span className="portal-infra__mono">
        {r.throughput.toLocaleString()}/min
      </span>
    ),
  },
  {
    key: "p99",
    header: "P99",
    align: "right",
    render: (r) => <span className="portal-infra__mono">{r.p99Ms} ms</span>,
  },
];

const deployCols: TableColumn<RecentDeployment>[] = [
  {
    key: "version",
    header: "Version",
    render: (d) => <code className="portal-infra__cell-code">{d.version}</code>,
  },
  {
    key: "environment",
    header: "Environment",
    render: (d) => (
      <Chip
        accent={
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
  { key: "product", header: "Product", render: (d) => d.product },
  {
    key: "status",
    header: "Status",
    render: (d) => (
      <StatusBadge tone={DEPLOY_TONE[d.status]} size="sm">
        {DEPLOY_LABEL[d.status]}
      </StatusBadge>
    ),
  },
  {
    key: "deployedBy",
    header: "Deployed by",
    render: (d) => <span className="portal-infra__mono">{d.deployedBy}</span>,
  },
  {
    key: "timestamp",
    header: "When",
    align: "right",
    render: (d) => <span className="portal-infra__muted">{d.timestamp}</span>,
  },
];

export function DeploymentsTab() {
  const { tier } = useTier();
  const state = useAsync<DeploymentsResponse>(
    () => fetchDeployments(tier),
    [tier],
  );
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  return (
    <div className="portal-infra__stack">
      <section>
        <SectionHeader
          title="Regions"
          sub="Live health for every deployed Stirling region — latency, load, and rollout version."
        />
        <Card padding="none">
          {isLoading && <TableSkeleton rows={3} cols={9} />}
          {isEmpty && (
            <EmptyState
              size="compact"
              title="No regions deployed"
              description="Deployed regions appear here once your workspace is provisioned."
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
          title="Recent deployments"
          sub="The latest rollouts across products and environments."
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
