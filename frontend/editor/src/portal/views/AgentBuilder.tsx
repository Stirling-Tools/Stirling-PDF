import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, EmptyState, Skeleton } from "@shared/components";
import { useTier } from "@portal/contexts/TierContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { fetchAgents, type AgentsResponse } from "@portal/api/agents";
import { AgentKpiStrip } from "@portal/components/agent-builder/AgentKpiStrip";
import { AgentSelector } from "@portal/components/agent-builder/AgentSelector";
import { AgentBuilderPanel } from "@portal/components/agent-builder/AgentBuilderPanel";
import { BootstrapDialog } from "@portal/components/agent-builder/BootstrapDialog";
import "@portal/views/AgentBuilder.css";

export function AgentBuilder() {
  const { t } = useTranslation();
  const { tier } = useTier();
  const state = useAsync<AgentsResponse>(() => fetchAgents(tier), [tier]);
  const { data, loading } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);

  const agents = data?.agents ?? [];
  // Default the selection to the first agent once data lands, but honour an
  // explicit pick. Recomputed each render so a tier change re-points cleanly.
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0] ?? null;

  // Enterprise unlocks restricted-tools governance and deep version history.
  const governanceUnlocked = tier === "enterprise";

  return (
    <div className="portal-agents">
      <header className="portal-agents__head">
        <div>
          <h1 className="portal-agents__title">{t("agentBuilder.title")}</h1>
          <p className="portal-agents__sub">{t("agentBuilder.subtitle")}</p>
        </div>
        <Button
          onClick={() => setBootstrapOpen(true)}
          leadingIcon={<span aria-hidden>⇪</span>}
        >
          {t("agentBuilder.bootstrapFromDocument")}
        </Button>
      </header>

      <AgentKpiStrip summary={data?.summary ?? null} loading={loading} />

      {isLoading && (
        <div className="portal-agents__layout">
          <div className="portal-agents__selector" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height="4rem" />
            ))}
          </div>
          <div className="portal-agents__builder" aria-hidden>
            <Skeleton height="18rem" />
          </div>
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={t("agentBuilder.empty.title")}
          description={t("agentBuilder.empty.description")}
          actions={
            <Button onClick={() => setBootstrapOpen(true)}>
              {t("agentBuilder.bootstrapFromDocument")}
            </Button>
          }
        />
      )}

      {!isLoading && !isEmpty && selected && (
        <div className="portal-agents__layout">
          <AgentSelector
            agents={agents}
            selectedId={selected.id}
            onSelect={setSelectedId}
          />
          <AgentBuilderPanel
            // Remount on selection change so each panel re-seeds its local
            // edit state from the freshly selected agent.
            key={selected.id}
            agent={selected}
            governanceUnlocked={governanceUnlocked}
          />
        </div>
      )}

      <BootstrapDialog
        open={bootstrapOpen}
        onClose={() => setBootstrapOpen(false)}
      />
    </div>
  );
}
