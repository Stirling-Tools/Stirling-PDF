import {
  Banner,
  Card,
  Chip,
  EmptyState,
  MetricCard,
  ProgressBar,
  Select,
  StatusBadge,
  Table,
  type SelectOption,
  type TableColumn,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchModels,
  type ModelEntry,
  type ModelsResponse,
  type RoutingRule,
} from "@portal/api/infrastructure";
import { SectionHeader } from "@portal/components/infrastructure/SectionHeader";
import { TableSkeleton } from "@portal/components/infrastructure/TableSkeleton";
import {
  MODEL_LABEL,
  MODEL_PROVIDER_LABEL,
  MODEL_TONE,
  MODEL_TYPE_LABEL,
  MODEL_TYPE_TONE,
  modelCost,
  pct,
} from "@portal/components/infrastructure/infraFormat";

const modelCols: TableColumn<ModelEntry>[] = [
  {
    key: "name",
    header: "Model",
    render: (m) => (
      <div className="portal-infra__cell-stack">
        <span className="portal-infra__cell-strong">{m.name}</span>
        <Chip accent="neutral" size="sm">
          {MODEL_PROVIDER_LABEL[m.provider]}
        </Chip>
      </div>
    ),
  },
  {
    key: "type",
    header: "Type",
    render: (m) => (
      <Chip accent={MODEL_TYPE_TONE[m.type]} size="sm">
        {MODEL_TYPE_LABEL[m.type]}
      </Chip>
    ),
  },
  {
    key: "status",
    header: "Status",
    render: (m) => (
      <StatusBadge
        tone={MODEL_TONE[m.status]}
        size="sm"
        pulse={m.status === "active"}
      >
        {MODEL_LABEL[m.status]}
      </StatusBadge>
    ),
  },
  {
    key: "load",
    header: "Load",
    width: "9rem",
    render: (m) => (
      <div className="portal-infra__load">
        <ProgressBar value={m.load} thresholded height={6} />
        <span className="portal-infra__load-pct">{pct(m.load)}</span>
      </div>
    ),
  },
  {
    key: "latency",
    header: "Latency",
    align: "right",
    render: (m) => <span className="portal-infra__mono">{m.latencyMs} ms</span>,
  },
  {
    key: "cost",
    header: "Cost",
    align: "right",
    render: (m) => (
      <span className="portal-infra__mono">
        {modelCost(m.cost, m.costUnit)}
      </span>
    ),
  },
  {
    key: "version",
    header: "Version",
    render: (m) => <code className="portal-infra__cell-code">{m.version}</code>,
  },
];

export function ModelsTab() {
  const { tier } = useTier();
  const state = useAsync<ModelsResponse>(() => fetchModels(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  // Free has no routing control: the catalogue is read-only and the routing
  // table is replaced by an upgrade nudge.
  const canRoute = tier !== "free";

  // Routing overrides are interactive but unbacked — assigning a model just
  // moves local UI state until the routing endpoint exists.
  // TODO(backend): PUT /v1/infrastructure/models/routing { rules }
  const modelOptions: SelectOption[] =
    data?.models
      .filter((m) => m.status !== "disabled")
      .map((m) => ({ value: m.id, label: m.name })) ?? [];

  const routingCols: TableColumn<RoutingRule>[] = [
    {
      key: "operation",
      header: "Operation",
      render: (r) => (
        <div className="portal-infra__cell-stack">
          <span className="portal-infra__cell-strong">{r.operation}</span>
          {r.isDefault && (
            <Chip accent="blue" size="sm">
              Default
            </Chip>
          )}
        </div>
      ),
    },
    { key: "docType", header: "Document type", render: (r) => r.docType },
    {
      key: "modelId",
      header: "Routed to",
      width: "16rem",
      render: (r) => (
        <Select
          inputSize="sm"
          options={modelOptions}
          defaultValue={r.modelId}
          aria-label={`Model for ${r.operation}`}
        />
      ),
    },
  ];

  return (
    <div className="portal-infra__stack">
      <SectionHeader
        title="Models"
        sub="The model catalogue and routing that powers document processing across your workspace."
      />

      {data && (
        <section className="portal-infra__metrics">
          <MetricCard label="Active models" value={data.summary.activeModels} />
          <MetricCard
            label="Avg latency"
            value={`${data.summary.avgLatencyMs} ms`}
          />
          <MetricCard
            label="Monthly model spend"
            value={
              data.summary.monthlySpend > 0
                ? `$${data.summary.monthlySpend.toLocaleString()}`
                : "Included"
            }
          />
        </section>
      )}

      <section>
        <SectionHeader
          title="Catalogue"
          sub={
            tier === "enterprise"
              ? "Managed, bring-your-own, and on-prem models — with per-region pinning available."
              : "Managed models available to your workspace, with live latency and cost."
          }
        />
        <Card padding="none">
          {isLoading && <TableSkeleton rows={4} cols={7} />}
          {isEmpty && (
            <EmptyState
              size="compact"
              title="No models available"
              description="Models in your workspace's catalogue appear here."
            />
          )}
          {!isEmpty && data && data.models.length > 0 && (
            <Table
              columns={modelCols}
              rows={data.models}
              rowKey={(m) => m.id}
            />
          )}
        </Card>
      </section>

      {tier === "enterprise" && (
        <Banner
          tone="info"
          title="Bring your own model"
          description="Register an on-prem or self-hosted model and pin it to a region for data-residency-bound processing."
        />
      )}

      <section>
        <SectionHeader
          title="Routing rules"
          sub={
            canRoute
              ? "Which model handles each operation. The default applies when no narrower rule matches."
              : "Route operations to specific models — available on paid plans."
          }
        />
        {canRoute ? (
          <Card padding="none">
            {isLoading && <TableSkeleton rows={4} cols={3} />}
            {!isEmpty && data && (
              <Table
                columns={routingCols}
                rows={data.routing}
                rowKey={(r) => r.id}
                empty="No routing rules configured."
              />
            )}
          </Card>
        ) : (
          <Banner
            tone="info"
            title="Model routing is a paid feature"
            description="Upgrade to Pro to control which model handles each operation and document type."
          />
        )}
      </section>
    </div>
  );
}
