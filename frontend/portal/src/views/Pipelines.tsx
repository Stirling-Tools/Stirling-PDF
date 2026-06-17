import { useMemo, useState } from "react";
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
import { PipelineCard } from "@portal/components/pipelines/PipelineCard";
import { PipelineComposer } from "@portal/components/pipelines/PipelineComposer";
import { PipelineDetail } from "@portal/components/pipelines/PipelineDetail";
import { PipelineListSkeleton } from "@portal/components/pipelines/PipelineListSkeleton";
import "@portal/views/Pipelines.css";

export function Pipelines() {
  const { tier } = useTier();
  const state = useAsync<PipelinesResponse>(() => fetchPipelines(tier), [tier]);
  const { data } = state;
  const { isLoading } = useSectionFlags(state);

  const [composerOpen, setComposerOpen] = useState(false);
  const [selected, setSelected] = useState<Pipeline | null>(null);

  const pipelines = data?.pipelines ?? [];
  const evals = data?.evals ?? null;
  const isEmpty = !isLoading && pipelines.length === 0;

  const fleetHealthy = useMemo(
    () => pipelines.filter((p) => p.status === "healthy").length,
    [pipelines],
  );

  return (
    <div className="portal-pipelines">
      <header className="portal-pipelines__header">
        <div>
          <h1 className="portal-pipelines__title">Pipelines</h1>
          <p className="portal-pipelines__sub">
            Document workflows composed from typed operations — deployed,
            versioned, and continuously validated against a golden set.
          </p>
        </div>
        <Button
          variant="gradient"
          onClick={() => setComposerOpen(true)}
          leadingIcon={<span aria-hidden>+</span>}
        >
          New pipeline
        </Button>
      </header>

      {!isLoading && pipelines.length > 0 && (
        <div className="portal-pipelines__fleet">
          <StatusBadge tone="success" size="sm">
            {fleetHealthy} healthy
          </StatusBadge>
          {fleetHealthy < pipelines.length && (
            <StatusBadge tone="warning" size="sm">
              {pipelines.length - fleetHealthy} degraded
            </StatusBadge>
          )}
          <span className="portal-pipelines__fleet-count">
            {pipelines.length} deployed
          </span>
        </div>
      )}

      {tier === "enterprise" && evals && (
        <Banner tone="info" title="Shadow + comparative evals active">
          {evals.shadowCount} pipeline{evals.shadowCount === 1 ? "" : "s"}{" "}
          running a shadow eval, {evals.comparativeCount} in a comparative run.{" "}
          {evals.detail}
        </Banner>
      )}

      {isLoading && <PipelineListSkeleton />}

      {isEmpty && (
        <EmptyState
          title="No pipelines yet"
          description="Compose your first document workflow from the typed operation library — pick a source, chain the ops, and route the output."
          actions={
            <Button variant="gradient" onClick={() => setComposerOpen(true)}>
              Build your first pipeline
            </Button>
          }
        />
      )}

      {pipelines.length > 0 && (
        <div className="portal-pipelines__list">
          {pipelines.map((p) => (
            <PipelineCard key={p.id} pipeline={p} onOpen={setSelected} />
          ))}
        </div>
      )}

      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        width="lg"
        title={selected?.name}
        subtitle={
          selected
            ? `${selected.version} · ${selected.source} → ${selected.destination}`
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
