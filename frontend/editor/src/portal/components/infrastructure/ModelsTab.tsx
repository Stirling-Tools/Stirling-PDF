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
} from "@app/ui";
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
      header: t("portal.infrastructure.models.columns.model"),
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
      header: t("portal.infrastructure.models.columns.type"),
      render: (m) => (
        <Chip accent={MODEL_TYPE_TONE[m.type]} size="sm">
          {t(MODEL_TYPE_LABEL[m.type])}
        </Chip>
      ),
    },
    {
      key: "status",
      header: t("portal.infrastructure.models.columns.status"),
      render: (m) => (
        <StatusBadge
          tone={MODEL_TONE[m.status]}
          size="sm"
          pulse={m.status === "active"}
        >
          {t(MODEL_LABEL[m.status])}
        </StatusBadge>
      ),
    },
    {
      key: "load",
      header: t("portal.infrastructure.models.columns.load"),
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
      header: t("portal.infrastructure.models.columns.latency"),
      align: "right",
      render: (m) => (
        <span className="portal-infra__mono">
          {t("portal.infrastructure.models.msValue", { value: m.latencyMs })}
        </span>
      ),
    },
    {
      key: "cost",
      header: t("portal.infrastructure.models.columns.cost"),
      align: "right",
      render: (m) => (
        <span className="portal-infra__mono">
          {modelCost(t, m.cost, m.costUnit)}
        </span>
      ),
    },
    {
      key: "version",
      header: t("portal.infrastructure.models.columns.version"),
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
      header: t("portal.infrastructure.models.routingColumns.operation"),
      render: (r) => (
        <div className="portal-infra__cell-stack">
          <span className="portal-infra__cell-strong">{r.operation}</span>
          {r.isDefault && (
            <Chip accent="default" size="sm">
              {t("portal.infrastructure.models.routingColumns.default")}
            </Chip>
          )}
        </div>
      ),
    },
    {
      key: "docType",
      header: t("portal.infrastructure.models.routingColumns.docType"),
      render: (r) => r.docType,
    },
    {
      key: "modelId",
      header: t("portal.infrastructure.models.routingColumns.routedTo"),
      width: "16rem",
      render: (r) => (
        <Select
          inputSize="sm"
          options={modelOptions}
          defaultValue={r.modelId}
          aria-label={t(
            "portal.infrastructure.models.routingColumns.modelForAria",
            {
              operation: r.operation,
            },
          )}
        />
      ),
    },
  ];

  return (
    <div className="portal-infra__stack">
      <SectionHeader
        title={t("portal.infrastructure.models.heading")}
        sub={t("portal.infrastructure.models.subheading")}
      />

      {data && (
        <section className="portal-infra__metrics">
          <MetricCard
            label={t("portal.infrastructure.models.metrics.activeModels")}
            value={data.summary.activeModels}
          />
          <MetricCard
            label={t("portal.infrastructure.models.metrics.avgLatency")}
            value={t("portal.infrastructure.models.msValue", {
              value: data.summary.avgLatencyMs,
            })}
          />
          <MetricCard
            label={t("portal.infrastructure.models.metrics.monthlySpend")}
            value={
              data.summary.monthlySpend > 0
                ? `$${data.summary.monthlySpend.toLocaleString()}`
                : t("portal.infrastructure.models.metrics.included")
            }
          />
        </section>
      )}

      <section>
        <SectionHeader
          title={t("portal.infrastructure.models.catalogue.heading")}
          sub={
            tier === "enterprise"
              ? t("portal.infrastructure.models.catalogue.subEnterprise")
              : t("portal.infrastructure.models.catalogue.sub")
          }
        />
        <Card padding="none">
          {isLoading && <TableSkeleton rows={4} cols={7} />}
          {isEmpty && (
            <EmptyState
              size="compact"
              title={t("portal.infrastructure.models.catalogue.empty.title")}
              description={t(
                "portal.infrastructure.models.catalogue.empty.description",
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
          title={t("portal.infrastructure.models.byom.title")}
          description={t("portal.infrastructure.models.byom.description")}
        />
      )}

      <section>
        <SectionHeader
          title={t("portal.infrastructure.models.routing.heading")}
          sub={
            canRoute
              ? t("portal.infrastructure.models.routing.sub")
              : t("portal.infrastructure.models.routing.subLocked")
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
                empty={t("portal.infrastructure.models.routing.empty")}
              />
            )}
          </Card>
        ) : (
          <Banner
            tone="info"
            title={t("portal.infrastructure.models.routing.lockedBanner.title")}
            description={t(
              "portal.infrastructure.models.routing.lockedBanner.description",
            )}
          />
        )}
      </section>
    </div>
  );
}
