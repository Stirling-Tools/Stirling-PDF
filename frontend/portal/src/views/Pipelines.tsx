import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  Drawer,
  EmptyState,
  StatusBadge,
} from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  fetchPipelines,
  type Pipeline,
  type PipelinesResponse,
} from "@portal/api/pipelines";
import { DeployedPipelinesTable } from "@portal/components/pipelines/DeployedPipelinesTable";
import { PipelineCard } from "@portal/components/pipelines/PipelineCard";
import { PipelineComposer } from "@portal/components/pipelines/PipelineComposer";
import { PipelineDetail } from "@portal/components/pipelines/PipelineDetail";
import { PipelineListSkeleton } from "@portal/components/pipelines/PipelineListSkeleton";
import { PromotedPipelines } from "@portal/components/pipelines/PromotedPipelines";
import "@portal/views/Pipelines.css";

export function Pipelines() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<PipelinesResponse>(() => fetchPipelines(tier), [tier]);
  const { data } = state;
  const { isLoading } = useSectionFlags(state);

  const [composerOpen, setComposerOpen] = useState(false);
  const [selected, setSelected] = useState<Pipeline | null>(null);

  const pipelines = data?.pipelines ?? [];
  const evals = data?.evals ?? null;
  const promoted = data?.promoted ?? [];
  const isEmpty = !isLoading && pipelines.length === 0;

  const fleetHealthy = useMemo(
    () => pipelines.filter((p) => p.status === "healthy").length,
    [pipelines],
  );

  return (
    <div className="portal-pipelines">
      <header className="portal-pipelines__header">
        <div>
          <h1 className="portal-pipelines__title">{t("pipelines.title")}</h1>
          <p className="portal-pipelines__sub">{t("pipelines.subtitle")}</p>
        </div>
        <Button
          variant="gradient"
          onClick={() => setComposerOpen(true)}
          leadingIcon={<span aria-hidden>+</span>}
        >
          {t("pipelines.newPipeline")}
        </Button>
      </header>

      {!isLoading && pipelines.length > 0 && (
        <div className="portal-pipelines__fleet">
          <StatusBadge tone="success" size="sm">
            {t("pipelines.fleet.healthy", { count: fleetHealthy })}
          </StatusBadge>
          {fleetHealthy < pipelines.length && (
            <StatusBadge tone="warning" size="sm">
              {t("pipelines.fleet.degraded", {
                count: pipelines.length - fleetHealthy,
              })}
            </StatusBadge>
          )}
          <span className="portal-pipelines__fleet-count">
            {t("pipelines.fleet.deployed", { count: pipelines.length })}
          </span>
        </div>
      )}

      {tier === "enterprise" && evals && (
        <Banner tone="info" title={t("pipelines.evals.title")}>
          {t("pipelines.evals.body", {
            count: evals.shadowCount,
            comparativeCount: evals.comparativeCount,
            detail: evals.detail,
          })}
        </Banner>
      )}

      {isLoading && <PipelineListSkeleton />}

      {isEmpty && (
        <EmptyState
          title={t("pipelines.empty.title")}
          description={t("pipelines.empty.description")}
          actions={
            <Button variant="gradient" onClick={() => setComposerOpen(true)}>
              {t("pipelines.empty.action")}
            </Button>
          }
        />
      )}

      {pipelines.length > 0 && (
        <section className="portal-pipelines__section">
          <h2 className="portal-pipelines__section-h">
            {t("pipelines.reliability.heading")}
          </h2>
          <p className="portal-pipelines__section-sub">
            {t("pipelines.reliability.description")}
          </p>
          <DeployedPipelinesTable
            pipelines={pipelines}
            onRowClick={setSelected}
          />
        </section>
      )}

      {pipelines.length > 0 && (
        <div className="portal-pipelines__list">
          {pipelines.map((p) => (
            <PipelineCard key={p.id} pipeline={p} onOpen={setSelected} />
          ))}
        </div>
      )}

      {promoted.length > 0 && (
        <section className="portal-pipelines__section">
          <h2 className="portal-pipelines__section-h">
            {t("pipelines.promoted.heading")}
          </h2>
          <p className="portal-pipelines__section-sub">
            {t("pipelines.promoted.description")}
          </p>
          <PromotedPipelines promoted={promoted} />
        </section>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        width="lg"
        title={selected?.name}
        subtitle={
          selected
            ? t("pipelines.detail.subtitle", {
                version: selected.version,
                source: selected.source,
                destination: selected.destination,
              })
            : undefined
        }
      >
        {selected && <PipelineDetail pipeline={selected} />}
      </Drawer>

      <PipelineComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
      />
    </div>
  );
}
