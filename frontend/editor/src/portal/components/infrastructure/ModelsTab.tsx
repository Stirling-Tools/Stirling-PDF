import { useTranslation } from "react-i18next";
import {
  Banner,
  column,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MetricCard,
  MetricStrip,
  type SelectOption,
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
import {
  MODEL_LABEL,
  MODEL_PROVIDER_LABEL,
  MODEL_TONE,
  MODEL_TYPE_LABEL,
  modelCost,
  pct,
} from "@portal/components/infrastructure/infraFormat";

export function ModelsTab() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<ModelsResponse>(() => fetchModels(tier), [tier]);
  const { data } = state;
  const { isLoading } = useSectionFlags(state);

  const modelCols: DataTableColumn<ModelEntry>[] = [
    column.entity({
      key: "name",
      header: t("portal.infrastructure.models.columns.model"),
      sortable: true,
      primary: (m) => m.name,
    }),
    column.text({
      key: "provider",
      header: t("portal.infrastructure.models.columns.provider", "Provider"),
      sortable: true,
      get: (m) => MODEL_PROVIDER_LABEL[m.provider],
    }),
    column.text({
      key: "type",
      header: t("portal.infrastructure.models.columns.type"),
      sortable: true,
      get: (m) => t(MODEL_TYPE_LABEL[m.type]),
    }),
    column.badge({
      key: "status",
      header: t("portal.infrastructure.models.columns.status"),
      sortable: true,
      get: (m) => ({
        tone: MODEL_TONE[m.status],
        label: t(MODEL_LABEL[m.status]),
      }),
    }),
    column.progress({
      key: "load",
      header: t("portal.infrastructure.models.columns.load"),
      sortable: true,
      get: (m) => ({ value: m.load, label: pct(m.load) }),
      ariaLabel: (m) =>
        t("portal.infrastructure.models.loadAria", { name: m.name }),
    }),
    column.number({
      key: "latency",
      header: t("portal.infrastructure.models.columns.latency"),
      sortable: true,
      get: (m) => m.latencyMs,
      format: (n) => t("portal.infrastructure.models.msValue", { value: n }),
    }),
    column.mono({
      key: "cost",
      header: t("portal.infrastructure.models.columns.cost"),
      // Sort by the raw per-unit cost, not the formatted "$0.01 / page" label.
      sortable: true,
      sortBy: (m) => m.cost,
      get: (m) => modelCost(t, m.cost, m.costUnit),
    }),
    column.mono({
      key: "version",
      header: t("portal.infrastructure.models.columns.version"),
      sortable: true,
      get: (m) => m.version,
    }),
  ];

  // Free has no routing control: the catalogue is read-only and the routing
  // table is replaced by an upgrade nudge.
  const canRoute = tier !== "free";

  // Routing overrides are interactive but unbacked - assigning a model just
  // moves local UI state until the routing endpoint exists.
  // TODO(backend): PUT /v1/infrastructure/models/routing { rules }
  const modelOptions: SelectOption[] =
    data?.models
      .filter((m) => m.status !== "disabled")
      .map((m) => ({ value: m.id, label: m.name })) ?? [];

  const routingCols: DataTableColumn<RoutingRule>[] = [
    column.entity({
      key: "operation",
      header: t("portal.infrastructure.models.routingColumns.operation"),
      primary: (r) => r.operation,
      // The default rule was its own near-empty column; show it inline instead.
      suffix: (r) =>
        r.isDefault
          ? t("portal.infrastructure.models.routingColumns.default")
          : undefined,
    }),
    column.text({
      key: "docType",
      header: t("portal.infrastructure.models.routingColumns.docType"),
      get: (r) => r.docType,
    }),
    column.select({
      key: "modelId",
      header: t("portal.infrastructure.models.routingColumns.routedTo"),
      get: (r) => ({
        defaultValue: r.modelId,
        options: modelOptions,
        ariaLabel: t(
          "portal.infrastructure.models.routingColumns.modelForAria",
          {
            operation: r.operation,
          },
        ),
      }),
    }),
  ];

  return (
    <div className="portal-infra__stack">
      <SectionHeader
        title={t("portal.infrastructure.models.heading")}
        sub={t("portal.infrastructure.models.subheading")}
      />

      {data && (
        <MetricStrip layout="row">
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
        </MetricStrip>
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
        <DataTable
          columns={modelCols}
          rows={data?.models ?? []}
          rowKey={(m) => m.id}
          loading={isLoading}
          empty={
            <EmptyState
              size="compact"
              title={t("portal.infrastructure.models.catalogue.empty.title")}
              description={t(
                "portal.infrastructure.models.catalogue.empty.description",
              )}
            />
          }
        />
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
          <DataTable
            columns={routingCols}
            rows={data?.routing ?? []}
            rowKey={(r) => r.id}
            loading={isLoading}
            empty={t("portal.infrastructure.models.routing.empty")}
          />
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
