import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  EmptyState,
  Modal,
  Skeleton,
} from "@shared/components";
import { useView } from "@portal/contexts/ViewContext";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { errorMessage } from "@portal/api/http";
import {
  createSource,
  deleteSource,
  fetchSource,
  fetchSourceDocCounts,
  fetchSources,
  type Source,
  type SourcesResponse,
  type SourceView,
} from "@portal/api/sources";
import { AgentBuilderIcon } from "@portal/components/icons";
import { KpiStrip } from "@portal/components/sources/KpiStrip";
import { SourcesTable } from "@portal/components/sources/SourcesTable";
import { SourceDetailCard } from "@portal/components/sources/SourceDetailCard";
import { ConnectWizard } from "@portal/components/sources/ConnectWizard";
import "@portal/views/Sources.css";

export function Sources() {
  const { t } = useTranslation();
  const { setActiveView } = useView();
  // Refetch after every mutation by bumping this counter, so the table reflects
  // the in-memory store the handlers maintain (mirrors the Policies view).
  const [version, setVersion] = useState(0);
  const state = useAsync<SourcesResponse>(() => fetchSources(), [version]);
  const { data, loading } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [mutating, setMutating] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SourceView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sources = data?.sources ?? [];
  const expanded = sources.find((s) => s.id === expandedId) ?? null;

  // The 30-day sparkline series lives off the list endpoint; fetch it for the one
  // expanded row only (empty while collapsed, so no request fires).
  const docSeriesState = useAsync<{ id: string; series: number[] }>(
    () =>
      expandedId
        ? fetchSourceDocCounts(expandedId).then((series) => ({
            id: expandedId,
            series,
          }))
        : Promise.resolve({ id: "", series: [] }),
    [expandedId],
  );
  const docSeries =
    docSeriesState.data?.id === expandedId ? docSeriesState.data.series : [];

  function openCreate() {
    setEditingSource(null);
    setWizardOpen(true);
  }

  // Editing needs the raw source (config options), which the overview rows don't
  // carry, so fetch it before opening the wizard prefilled.
  async function openEdit(source: SourceView) {
    if (mutating) return;
    setPageError(null);
    setMutating(true);
    try {
      setEditingSource(await fetchSource(source.id));
      setWizardOpen(true);
    } catch (e) {
      setPageError(errorMessage(e));
    } finally {
      setMutating(false);
    }
  }

  // Pause/resume: re-save the source with enabled flipped (same POST contract as
  // edit). Fetch the raw record first so the full config round-trips intact.
  async function togglePause(source: SourceView) {
    if (mutating) return;
    setPageError(null);
    setMutating(true);
    try {
      const raw = await fetchSource(source.id);
      await createSource({ ...raw, enabled: !raw.enabled });
      refetch();
    } catch (e) {
      setPageError(errorMessage(e));
    } finally {
      setMutating(false);
    }
  }

  function requestDelete(source: SourceView) {
    setDeleteError(null);
    setPendingDelete(source);
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteSource(pendingDelete.id);
      setPendingDelete(null);
      setExpandedId(null);
      refetch();
    } catch (e) {
      setDeleteError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="portal-sources">
      <header className="portal-sources__head">
        <div>
          <h1 className="portal-sources__title">{t("sources.title")}</h1>
          <p className="portal-sources__sub">{t("sources.subtitle")}</p>
        </div>
        <div className="portal-sources__actions">
          <Button
            variant="outline"
            onClick={() => setActiveView("agent-builder")}
            leadingIcon={<AgentBuilderIcon size={16} />}
          >
            {t("sources.actions.agentBuilder")}
          </Button>
          <Button onClick={openCreate} leadingIcon={<span aria-hidden>+</span>}>
            {t("sources.actions.connectSource")}
          </Button>
        </div>
      </header>

      {pageError && <Banner tone="danger" description={pageError} />}

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
            <Button onClick={openCreate}>
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
          docSeries={docSeries}
          onClose={() => setExpandedId(null)}
          onEdit={openEdit}
          onTogglePause={togglePause}
          onDelete={requestDelete}
          busy={mutating}
        />
      )}

      <ConnectWizard
        open={wizardOpen}
        source={editingSource ?? undefined}
        onClose={() => setWizardOpen(false)}
        onCreated={refetch}
      />

      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        width="sm"
        title={t("sources.delete.title")}
        footer={
          <div className="portal-sources__wizard-footer">
            <Button
              variant="ghost"
              size="sm"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              {t("sources.delete.cancel")}
            </Button>
            <Button
              size="sm"
              accent="red"
              loading={deleting}
              onClick={confirmDelete}
            >
              {t("sources.delete.confirm")}
            </Button>
          </div>
        }
      >
        <p>{t("sources.delete.body", { name: pendingDelete?.name ?? "" })}</p>
        {deleteError && <Banner tone="danger" description={deleteError} />}
      </Modal>
    </div>
  );
}
