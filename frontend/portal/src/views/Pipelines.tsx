import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Banner,
  Button,
  EmptyState,
  Modal,
  Skeleton,
} from "@shared/components";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import { errorMessage } from "@portal/api/http";
import {
  deletePipeline,
  fetchPipeline,
  fetchPipelines,
  savePipeline,
  type PipelinesOverviewResponse,
  type PipelineView,
  type Policy,
} from "@portal/api/pipelines";
import { KpiStrip } from "@portal/components/pipelines/KpiStrip";
import { PipelinesTable } from "@portal/components/pipelines/PipelinesTable";
import { PipelineDetailCard } from "@portal/components/pipelines/PipelineDetailCard";
import { PipelineComposer } from "@portal/components/pipelines/PipelineComposer";
import "@portal/views/Pipelines.css";

export function Pipelines() {
  const { t } = useTranslation();
  // Refetch after every mutation by bumping this counter, so the table reflects
  // the backend (mirrors the Sources view).
  const [version, setVersion] = useState(0);
  const state = useAsync<PipelinesOverviewResponse>(
    () => fetchPipelines(),
    [version],
  );
  const { data, loading } = state;
  const { isLoading, isEmpty } = useSectionFlags(state);
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [mutating, setMutating] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PipelineView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pipelines = data?.pipelines ?? [];
  const expanded = pipelines.find((p) => p.id === expandedId) ?? null;

  function openCreate() {
    setEditing(null);
    setComposerOpen(true);
  }

  // Editing needs the raw policy (steps, trigger, source ids), which the overview
  // rows don't carry, so fetch it before opening the composer prefilled.
  async function openEdit(pipeline: PipelineView) {
    if (mutating) return;
    setPageError(null);
    setMutating(true);
    try {
      setEditing(await fetchPipeline(pipeline.id));
      setComposerOpen(true);
    } catch (e) {
      setPageError(errorMessage(e));
    } finally {
      setMutating(false);
    }
  }

  // Pause/resume: re-save the policy with enabled flipped (the backend has no
  // dedicated endpoint; every mutation routes through POST /policies). Fetch the
  // raw record first so the full config round-trips intact.
  async function togglePause(pipeline: PipelineView) {
    if (mutating) return;
    setPageError(null);
    setMutating(true);
    try {
      const raw = await fetchPipeline(pipeline.id);
      await savePipeline({ ...raw, enabled: !raw.enabled });
      refetch();
    } catch (e) {
      setPageError(errorMessage(e));
    } finally {
      setMutating(false);
    }
  }

  function requestDelete(pipeline: PipelineView) {
    setDeleteError(null);
    setPendingDelete(pipeline);
  }

  async function confirmDelete() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deletePipeline(pendingDelete.id);
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
    <div className="portal-pipelines">
      <header className="portal-pipelines__head">
        <div>
          <h1 className="portal-pipelines__title">{t("pipelines.title")}</h1>
          <p className="portal-pipelines__sub">{t("pipelines.subtitle")}</p>
        </div>
        <Button onClick={openCreate} leadingIcon={<span aria-hidden>+</span>}>
          {t("pipelines.actions.newPipeline")}
        </Button>
      </header>

      {pageError && <Banner tone="danger" description={pageError} />}

      <KpiStrip data={data} loading={loading} />

      {isLoading && (
        <div className="portal-pipelines__table-skeleton" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3rem" />
          ))}
        </div>
      )}

      {isEmpty && (
        <EmptyState
          title={t("pipelines.empty.title")}
          description={t("pipelines.empty.description")}
          actions={
            <Button onClick={openCreate}>{t("pipelines.empty.action")}</Button>
          }
        />
      )}

      {!isLoading && !isEmpty && pipelines.length > 0 && (
        <PipelinesTable
          pipelines={pipelines}
          expandedId={expandedId}
          onRowClick={(p) =>
            setExpandedId((cur) => (cur === p.id ? null : p.id))
          }
        />
      )}

      {expanded && (
        <PipelineDetailCard
          pipeline={expanded}
          onClose={() => setExpandedId(null)}
          onEdit={openEdit}
          onTogglePause={togglePause}
          onDelete={requestDelete}
          busy={mutating}
        />
      )}

      <PipelineComposer
        open={composerOpen}
        pipeline={editing ?? undefined}
        onClose={() => setComposerOpen(false)}
        onSaved={refetch}
      />

      <Modal
        open={pendingDelete !== null}
        onClose={() => !deleting && setPendingDelete(null)}
        width="sm"
        title={t("pipelines.delete.title")}
        footer={
          <div className="portal-pipelines__composer-footer">
            <Button
              variant="ghost"
              size="sm"
              disabled={deleting}
              onClick={() => setPendingDelete(null)}
            >
              {t("pipelines.delete.cancel")}
            </Button>
            <Button
              size="sm"
              accent="red"
              loading={deleting}
              onClick={confirmDelete}
            >
              {t("pipelines.delete.confirm")}
            </Button>
          </div>
        }
      >
        <p>{t("pipelines.delete.body", { name: pendingDelete?.name ?? "" })}</p>
        {deleteError && <Banner tone="danger" description={deleteError} />}
      </Modal>
    </div>
  );
}
