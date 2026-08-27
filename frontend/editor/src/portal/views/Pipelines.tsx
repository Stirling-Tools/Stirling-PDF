import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Banner, Button, CardRail, EmptyState, Skeleton } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { useSectionFlags } from "@portal/hooks/useAsync";
import { usePipelines } from "@portal/queries/pipelines";
import { usePoliciesOverview } from "@portal/queries/policies";
import {
  fetchPipeline,
  type PipelineView,
  type Policy,
} from "@portal/api/pipelines";
import {
  buildWireFromSetup,
  buildWireFromState,
  clearProcessedHistory,
  deletePolicy,
  parseSimplePolicy,
  savePolicy,
  type CatalogueEntry,
  type PolicySetupResult,
} from "@portal/api/policies";
import { qk } from "@portal/queries/keys";
import { VIEW_PATHS, toPortalPath } from "@portal/contexts/ViewContext";
import { PipelinesIcon } from "@portal/components/icons";
import { KpiStrip } from "@portal/components/pipelines/KpiStrip";
import { PipelinesTable } from "@portal/components/pipelines/PipelinesTable";
import { PipelineTemplateCard } from "@portal/components/pipelines/PipelineTemplateCard";
import { PolicyDetailPanel } from "@portal/components/policies/PolicyDetailPanel";
import { PolicySetupWizard } from "@portal/components/policies/PolicySetupWizard";
import { useAiEngineEnabled } from "@portal/hooks/useAiEngineEnabled";
import "@portal/views/Pipelines.css";

/**
 * The unified Pipelines + Policies surface. A policy is simply a pipeline the org requires to run;
 * the six suggested policies are templates that seed one. The page has two bands: a "suggested
 * policies" gallery of templates not yet set up (the friendly, simple entry point), and the full
 * list of every pipeline/policy. A policy that still fits its template edits in the simple wizard;
 * once customised beyond it, in the full builder (see {@link parseSimplePolicy}).
 */
export function Pipelines() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const listState = usePipelines();
  const { data: overview, loading: overviewLoading } = listState;
  const { isLoading: listLoading } = useSectionFlags(listState);

  const catalogueState = usePoliciesOverview();
  const { data: catalogueData } = catalogueState;

  const { enabled: aiEngineEnabled, loading: aiEngineLoading } =
    useAiEngineEnabled();

  const [detail, setDetail] = useState<CatalogueEntry | null>(null);
  const [wizard, setWizard] = useState<CatalogueEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const listPath = toPortalPath(VIEW_PATHS.pipelines);

  const pipelines = overview?.pipelines ?? [];
  const hasPipelines = pipelines.length > 0;
  const showEmpty = !listLoading && pipelines.length === 0;

  const isLocked = useCallback(
    (entry: CatalogueEntry): boolean =>
      entry.category.requiresAiEngine === true &&
      !aiEngineEnabled &&
      !aiEngineLoading,
    [aiEngineEnabled, aiEngineLoading],
  );

  // The gallery is the on-ramp: only suggested policies NOT yet set up (once configured a policy
  // lives in the list below). Templates the user can set up now sort first; coming-soon / AI-locked
  // ones stay, shown disabled, at the end (a stable sort keeps each group in its original order).
  const galleryEntries = useMemo(() => {
    const entries = (catalogueData?.catalogue ?? []).filter(
      (e) => e.policy === null,
    );
    const usable = (e: CatalogueEntry) =>
      !e.category.comingSoon && !isLocked(e);
    return [...entries].sort((a, b) => Number(usable(b)) - Number(usable(a)));
  }, [catalogueData, isLocked]);

  // Pipelines and policies share a backend, and Home/onboarding read the same caches, so refresh all
  // three: the overview list, the catalogue list, and runs.
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.pipelines() });
    queryClient.invalidateQueries({ queryKey: qk.policiesList() });
    queryClient.invalidateQueries({ queryKey: qk.policyRuns() });
  }, [queryClient]);

  const openCreate = () => navigate(`${listPath}/new`);
  const connectSource = () =>
    navigate(`${toPortalPath(VIEW_PATHS.sources)}/new`);

  // Open a suggested template in the simple wizard (a fresh policy). AI-gated templates stay closed
  // until the engine is confirmed on, so a click during the app-config load can't open a disabled one.
  const openTemplate = useCallback(
    (entry: CatalogueEntry) => {
      if (entry.category.comingSoon) return;
      if (entry.category.requiresAiEngine && !aiEngineEnabled) return;
      setWizard(entry);
    },
    [aiEngineEnabled],
  );

  // A list row routes by representability: a policy that still fits its template opens the simple
  // detail panel (edit/pause/delete there); anything else opens the full builder. The full record is
  // fetched on click so parseSimplePolicy - the single authority - decides on real data.
  const openListRow = useCallback(
    async (view: PipelineView) => {
      setPageError(null);
      try {
        const policy = await fetchPipeline(view.id);
        const entry = parseSimplePolicy(policy);
        if (entry) setDetail(entry);
        else navigate(`${listPath}/${view.id}`);
      } catch (e) {
        setPageError(errorMessage(e));
      }
    },
    [navigate, listPath],
  );

  // ?setup=<categoryId> deep link (onboarding): open the wizard for that suggested policy, then
  // strip the param so back/reload doesn't re-open it.
  useEffect(() => {
    const setupId = searchParams.get("setup");
    if (!setupId || !catalogueData) return;
    const entry = catalogueData.catalogue.find(
      (e) => e.category.id === setupId,
    );
    if (entry && !entry.category.comingSoon) {
      if (entry.policy) setDetail(entry);
      else setWizard(entry);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    setSearchParams(next, { replace: true });
  }, [searchParams, catalogueData, setSearchParams]);

  /** The current settings as a full pipeline record, for save or hand-off. */
  function draftFromResult(entry: CatalogueEntry, result: PolicySetupResult) {
    const wire = buildWireFromSetup(entry, result, t);
    const draft: Policy = {
      id: entry.policy?.state.backendId,
      name: wire.name,
      enabled: wire.enabled,
      required: wire.required,
      inputs: [],
      steps: wire.steps,
      output: { type: wire.output.type, options: wire.output.options },
      outputIds: [],
    };
    return draft;
  }

  async function handleSubmit(
    entry: CatalogueEntry,
    result: PolicySetupResult,
  ) {
    setPageError(null);
    try {
      await savePolicy(buildWireFromSetup(entry, result, t));
      setWizard(null);
      setDetail(null);
      refetch();
    } catch (e) {
      setPageError(errorMessage(e));
    }
  }

  // Customise: hand the in-progress policy to the full builder. A saved policy keeps editing its own
  // route; a new one goes to /new. The draft (unsaved wizard edits as a pipeline) rides in history
  // state so the builder seeds from it rather than fetching.
  function handleCustomise(entry: CatalogueEntry, result: PolicySetupResult) {
    const draft = draftFromResult(entry, result);
    const target = draft.id ? `${listPath}/${draft.id}` : `${listPath}/new`;
    setWizard(null);
    navigate(target, { state: { draft } });
  }

  async function runLifecycle(action: () => Promise<unknown>) {
    if (busy) return;
    setPageError(null);
    setBusy(true);
    try {
      await action();
      setDetail(null);
      refetch();
    } catch (e) {
      setPageError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function handleTogglePause() {
    const entry = detail;
    const policy = entry?.policy;
    if (!entry || !policy?.state.backendId) return;
    const enabled = policy.state.status === "paused";
    void runLifecycle(() =>
      savePolicy(buildWireFromState(entry, policy, enabled, t)),
    );
  }

  function handleDelete() {
    const id = detail?.policy?.state.backendId;
    if (id) void runLifecycle(() => deletePolicy(id));
  }

  function handleClearHistory() {
    const id = detail?.policy?.state.backendId;
    if (id) void runLifecycle(() => clearProcessedHistory(id));
  }

  function handleEdit() {
    if (detail) {
      setWizard(detail);
      setDetail(null);
    }
  }

  return (
    <div className="portal-pipelines">
      <header className="portal-pipelines__head">
        <div>
          <h1 className="portal-pipelines__title">
            {t("portal.pipelines.title")}
          </h1>
          <p className="portal-pipelines__sub">
            {t("portal.pipelines.subtitle")}
          </p>
        </div>
        <Button
          fat
          onClick={openCreate}
          leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {t("portal.pipelines.actions.newCustomPipeline")}
        </Button>
      </header>

      {pageError && <Banner tone="danger" description={pageError} />}

      <section className="portal-pipelines__all">
        <h2 className="portal-pipelines__section-title">
          {t("portal.pipelines.all.title")}
        </h2>

        {hasPipelines && <KpiStrip data={overview} loading={overviewLoading} />}

        {listLoading && (
          <div className="portal-pipelines__table-skeleton" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height="3rem" />
            ))}
          </div>
        )}

        {showEmpty && (
          <EmptyState
            icon={<PipelinesIcon size={28} />}
            title={t("portal.pipelines.empty.title")}
            description={t("portal.pipelines.empty.description")}
            actions={
              <>
                <Button
                  onClick={openCreate}
                  leftSection={
                    <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                  }
                >
                  {t("portal.pipelines.empty.action")}
                </Button>
                <Button variant="secondary" onClick={connectSource}>
                  {t("portal.pipelines.empty.connectSource")}
                </Button>
              </>
            }
          />
        )}

        {!listLoading && hasPipelines && (
          <PipelinesTable pipelines={pipelines} onRowClick={openListRow} />
        )}
      </section>

      {galleryEntries.length > 0 && (
        <section className="portal-pipelines__templates">
          <h2 className="portal-pipelines__section-title">
            {t("portal.pipelines.templates.title")}
          </h2>
          <CardRail itemWidth="16rem" itemHeight="10.75rem">
            {galleryEntries.map((entry) => (
              <PipelineTemplateCard
                key={entry.category.id}
                entry={entry}
                onOpen={openTemplate}
                locked={isLocked(entry)}
                lockedLabel={t("portal.policies.card.requiresAiEngine")}
              />
            ))}
          </CardRail>
        </section>
      )}

      <PolicyDetailPanel
        policy={detail?.policy ?? null}
        busy={busy}
        onClose={() => setDetail(null)}
        onEdit={handleEdit}
        onTogglePause={handleTogglePause}
        onDelete={handleDelete}
        onClearHistory={handleClearHistory}
      />

      <PolicySetupWizard
        entry={wizard}
        onClose={() => setWizard(null)}
        onSubmit={handleSubmit}
        onCustomise={handleCustomise}
      />
    </div>
  );
}
