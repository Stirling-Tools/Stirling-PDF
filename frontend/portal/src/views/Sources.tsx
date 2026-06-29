import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          <h1 className="portal-sources__title">{t("sources.title")}</h1>
          <p className="portal-sources__sub">{t("sources.subtitle")}</p>
        </div>
        <div className="portal-sources__actions">
          <Button
            variant="secondary"
            onClick={() => setActiveView("agent-builder")}
            leftSection={<AgentBuilderIcon size={16} />}
          >
            {t("sources.actions.agentBuilder")}
          </Button>
          <Button
            onClick={() => setWizardOpen(true)}
            leftSection={<span aria-hidden>+</span>}
          >
            {t("sources.actions.connectSource")}
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
          title={t("sources.empty.title")}
          description={t("sources.empty.description")}
          actions={
            <Button onClick={() => setWizardOpen(true)}>
              {t("sources.actions.connectSource")}
            </Button>
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
