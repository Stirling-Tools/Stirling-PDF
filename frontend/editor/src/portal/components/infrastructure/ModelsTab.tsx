import { useTranslation } from "react-i18next";
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

export function ModelsTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<ModelsResponse>(() => fetchModels(tier), [tier]);
  const { data } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const modelCols: TableColumn<ModelEntry>[] = [
    {
      key: "name",
      header: t("infrastructure.models.columns.model"),
      render: (m) => (
        <div className="portal-infra__cell-stack">
          <span className="portal-infra__cell-strong">{m.name}</span>
          <Chip tone="neutral" size="sm">
            {MODEL_PROVIDER_LABEL[m.provider]}
          </Chip>
        </div>
      ),
    },
    {
      key: "type",
      header: t("infrastructure.models.columns.type"),
      render: (m) => (
        <Chip tone={MODEL_TYPE_TONE[m.type]} size="sm">
          {MODEL_TYPE_LABEL[m.type]}
        </Chip>
      ),
    },
    {
      key: "status",
      header: t("infrastructure.models.columns.status"),
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
      header: t("infrastructure.models.columns.load"),
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
      header: t("infrastructure.models.columns.latency"),
      align: "right",
      render: (m) => (
        <span className="portal-infra__mono">
          {t("infrastructure.models.msValue", { value: m.latencyMs })}
        </span>
      ),
    },
    {
      key: "cost",
      header: t("infrastructure.models.columns.cost"),
      align: "right",
      render: (m) => (
        <span className="portal-infra__mono">
          {modelCost(m.cost, m.costUnit)}
        </span>
      ),
    },
    {
      key: "version",
      header: t("infrastructure.models.columns.version"),
      render: (m) => (
        <code className="portal-infra__cell-code">{m.version}</code>
      ),
    },
  ];

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
      header: t("infrastructure.models.routingColumns.operation"),
      render: (r) => (
        <div className="portal-infra__cell-stack">
          <span className="portal-infra__cell-strong">{r.operation}</span>
          {r.isDefault && (
            <Chip tone="blue" size="sm">
              {t("infrastructure.models.routingColumns.default")}
            </Chip>
          )}
        </div>
      ),
    },
    {
      key: "docType",
      header: t("infrastructure.models.routingColumns.docType"),
      render: (r) => r.docType,
    },
    {
      key: "modelId",
      header: t("infrastructure.models.routingColumns.routedTo"),
      width: "16rem",
      render: (r) => (
        <Select
          inputSize="sm"
          options={modelOptions}
          defaultValue={r.modelId}
          aria-label={t("infrastructure.models.routingColumns.modelForAria", {
            operation: r.operation,
          })}
        />
      ),
    },
  ];

  return (
    <div className="portal-infra__stack">
      <SectionHeader
        title={t("infrastructure.models.heading")}
        sub={t("infrastructure.models.subheading")}
      />

      {data && (
        <section className="portal-infra__metrics">
          <MetricCard
            label={t("infrastructure.models.metrics.activeModels")}
            value={data.summary.activeModels}
          />
          <MetricCard
            label={t("infrastructure.models.metrics.avgLatency")}
            value={t("infrastructure.models.msValue", {
              value: data.summary.avgLatencyMs,
            })}
          />
          <MetricCard
            label={t("infrastructure.models.metrics.monthlySpend")}
            value={
              data.summary.monthlySpend > 0
                ? `$${data.summary.monthlySpend.toLocaleString()}`
                : t("infrastructure.models.metrics.included")
            }
          />
        </section>
      )}

      <section>
        <SectionHeader
          title={t("infrastructure.models.catalogue.heading")}
          sub={
            tier === "enterprise"
              ? t("infrastructure.models.catalogue.subEnterprise")
              : t("infrastructure.models.catalogue.sub")
          }
        />
        <Card padding="none">
          {isLoading && <TableSkeleton rows={4} cols={7} />}
          {isEmpty && (
            <EmptyState
              size="compact"
              title={t("infrastructure.models.catalogue.empty.title")}
              description={t(
                "infrastructure.models.catalogue.empty.description",
              )}
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
          title={t("infrastructure.models.byom.title")}
          description={t("infrastructure.models.byom.description")}
        />
      )}

      <section>
        <SectionHeader
          title={t("infrastructure.models.routing.heading")}
          sub={
            canRoute
              ? t("infrastructure.models.routing.sub")
              : t("infrastructure.models.routing.subLocked")
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
                empty={t("infrastructure.models.routing.empty")}
              />
            )}
          </Card>
        ) : (
          <Banner
            tone="info"
            title={t("infrastructure.models.routing.lockedBanner.title")}
            description={t(
              "infrastructure.models.routing.lockedBanner.description",
            )}
          />
        )}
      </section>
    </div>
  );
}
