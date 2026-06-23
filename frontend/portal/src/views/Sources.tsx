import { useState } from "react";
import { Button, EmptyState, Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { fetchSources, type SourcesResponse } from "@portal/api/sources";
import { AgentBuilderIcon } from "@portal/components/icons";
import { KpiStrip } from "@portal/components/sources/KpiStrip";
import { SourcesTable } from "@portal/components/sources/SourcesTable";
import { SourceDetailCard } from "@portal/components/sources/SourceDetailCard";
import { ConnectWizard } from "@portal/components/sources/ConnectWizard";
import "@portal/views/Sources.css";

export function Sources() {
  const { tier } = useTier();
  const { setActiveView } = useView();
  const state = useAsync<SourcesResponse>(() => fetchSources(tier), [tier]);
  const { data, loading } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const sources = data?.sources ?? [];
  const expanded = sources.find((s) => s.id === expandedId) ?? null;

  return (
    <div className="portal-sources">
      <header className="portal-sources__head">
        <div>
          <h1 className="portal-sources__title">Sources &amp; Agents</h1>
          <p className="portal-sources__sub">
            Every place documents flow into Stirling — agents, API clients,
            webhooks, connectors and more. Click a row for type-specific detail.
          </p>
        </div>
        <div className="portal-sources__actions">
          <Button
            variant="outlined"
            onClick={() => setActiveView("agent-builder")}
            leftSection={<AgentBuilderIcon size={16} />}
          >
            Agent Builder
          </Button>
          <Button
            onClick={() => setWizardOpen(true)}
            leftSection={<span aria-hidden>+</span>}
          >
            Connect source
          </Button>
        </div>
      </header>

      <KpiStrip data={data} loading={loading} />

      {isLoading && (
        <div className="portal-sources__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title="No sources connected yet"
          description="Connect an agent, API client, webhook, connector or inbox to start feeding documents into your pipelines."
          actions={
            <Button onClick={() => setWizardOpen(true)}>Connect source</Button>
          }
        />
      )}

      {!isLoading && !isEmpty && sources.length > 0 && (
        <SourcesTable
          sources={sources}
          expandedId={expandedId}
          onRowClick={(s) =>
            setExpandedId((cur) => (cur === s.id ? null : s.id))
          }
        />
      )}

      {expanded && (
        <SourceDetailCard
          source={expanded}
          onClose={() => setExpandedId(null)}
        />
      )}

      <ConnectWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
