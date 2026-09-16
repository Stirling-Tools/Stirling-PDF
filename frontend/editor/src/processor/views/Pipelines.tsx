import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { Banner, Button, CardRail, EmptyState, Skeleton } from "@app/ui";
import { errorMessage } from "@processor/api/http";
import { useSectionFlags } from "@processor/hooks/useAsync";
import { usePipelines } from "@processor/queries/pipelines";
import { usePoliciesOverview } from "@processor/queries/policies";
import {
  fetchPipeline,
  type PipelineView,
  type Policy,
} from "@processor/api/pipelines";
import {
  buildWireFromSetup,
  parseSimplePolicy,
  savePolicy,
  type CatalogueEntry,
  type PolicySetupResult,
} from "@processor/api/policies";
import { qk } from "@processor/queries/keys";
import { VIEW_PATHS, toProcessorPath } from "@processor/contexts/ViewContext";
import { PipelinesIcon } from "@processor/components/icons";
import { PipelinesTable } from "@processor/components/pipelines/PipelinesTable";
import { PipelineTemplateCard } from "@processor/components/pipelines/PipelineTemplateCard";
import { PolicySetupWizard } from "@processor/components/policies/PolicySetupWizard";
import { useAiEngineEnabled } from "@processor/hooks/useAiEngineEnabled";
import { useCanManagePolicies } from "@processor/queries/policyPermissions";
import "@processor/views/Pipelines.css";

/**
 * The unified Pipelines + Policies surface: a gallery of suggested-policy templates not yet set up,
 * above the full list of every pipeline/policy. A policy still fitting its template edits in the
 * simple wizard, otherwise in the full builder (see {@link parseSimplePolicy}).
 */
export function Pipelines() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const listState = usePipelines();
  const { data: overview } = listState;
  const { isLoading: listLoading } = useSectionFlags(listState);

  const catalogueState = usePoliciesOverview();
  const { data: catalogueData } = catalogueState;

  const { enabled: aiEngineEnabled, loading: aiEngineLoading } =
    useAiEngineEnabled();
  const {
    canManage: canManagePolicies,
    isLoading: permissionsLoading,
    isError: permissionsError,
    refetch: retryPermissions,
  } = useCanManagePolicies();

  const [wizard, setWizard] = useState<CatalogueEntry | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const listPath = toProcessorPath(VIEW_PATHS.pipelines);

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
    navigate(`${toProcessorPath(VIEW_PATHS.sources)}/new`);

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

  // Fetch the full record before choosing the wizard: the overview cannot tell whether the
  // pipeline has settings that only the full builder can preserve.
  const openListRow = async (view: PipelineView) => {
    setPageError(null);
    try {
      const policy = await fetchPipeline(view.id);
      const entry = parseSimplePolicy(policy, []);
      if (entry) setWizard(entry);
      else navigate(`${listPath}/${view.id}`);
    } catch (e) {
      setPageError(errorMessage(e));
    }
  };

  // ?setup=<categoryId> deep link (onboarding): open the wizard for that suggested policy, then
  // strip the param so back/reload doesn't re-open it.
  useEffect(() => {
    const setupId = searchParams.get("setup");
    if (!setupId || !catalogueData) return;
    const entry = catalogueData.catalogue.find(
      (e) => e.category.id === setupId,
    );
    if (entry && !entry.category.comingSoon) {
      setWizard(entry);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    setSearchParams(next, { replace: true });
  }, [searchParams, catalogueData, setSearchParams]);

  /** The current settings as a full pipeline record, for save or hand-off. */
  function draftFromResult(entry: CatalogueEntry, result: PolicySetupResult) {
    const wire = buildWireFromSetup(entry, result, t);
    const stored = entry.policy?.state;
    const draft: Policy = {
      id: stored?.backendId,
      name: stored?.name ?? wire.name,
      icon: stored?.icon,
      enabled: stored ? stored.status !== "paused" : wire.enabled,
      required: wire.required,
      inputs: [],
      steps: wire.steps,
      output: { type: wire.output.type, options: wire.output.options },
      outputIds: [],
      // A wizard policy only ever runs on the editor, so hand its editor participation to the
      // builder rather than letting it default to disabled.
      editor: wire.editor,
    };
    return draft;
  }

  async function handleSubmit(
    entry: CatalogueEntry,
    result: PolicySetupResult,
  ) {
    setPageError(null);
    try {
      const enabled = entry.policy?.state.status !== "paused";
      await savePolicy(buildWireFromSetup(entry, result, t, enabled));
      setWizard(null);
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

  return (
    <div className="processor-pipelines">
      <header className="processor-pipelines__head">
        <div>
          <h1 className="processor-pipelines__title">
            {t("processor.pipelines.title")}
          </h1>
          <p className="processor-pipelines__sub">
            {t("processor.pipelines.subtitle")}
          </p>
        </div>
        <Button
          fat
          onClick={openCreate}
          leftSection={<AddRoundedIcon style={{ fontSize: "1.125rem" }} />}
        >
          {t("processor.pipelines.actions.newCustomPipeline")}
        </Button>
      </header>

      {pageError && <Banner tone="danger" description={pageError} />}

      {permissionsError && (
        <Banner
          tone="warning"
          description={t("processor.pipelines.permissionsUnavailable")}
          action={
            <Button size="sm" variant="secondary" onClick={retryPermissions}>
              {t("processor.pipelines.permissionsRetry")}
            </Button>
          }
        />
      )}

      <section className="processor-pipelines__all">
        <h2 className="processor-pipelines__section-title">
          {t("processor.pipelines.all.title")}
        </h2>

        {listLoading && (
          <div className="processor-pipelines__table-skeleton" aria-hidden>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height="3rem" />
            ))}
          </div>
        )}

        {showEmpty && (
          <EmptyState
            icon={<PipelinesIcon size={28} />}
            title={t("processor.pipelines.empty.title")}
            description={t("processor.pipelines.empty.description")}
            actions={
              <>
                <Button
                  onClick={openCreate}
                  leftSection={
                    <AddRoundedIcon style={{ fontSize: "1.125rem" }} />
                  }
                >
                  {t("processor.pipelines.empty.action")}
                </Button>
                <Button variant="secondary" onClick={connectSource}>
                  {t("processor.pipelines.empty.connectSource")}
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
        <section className="processor-pipelines__templates">
          <h2 className="processor-pipelines__section-title">
            {t("processor.pipelines.templates.title")}
          </h2>
          <CardRail itemWidth="16rem" itemHeight="10.75rem">
            {galleryEntries.map((entry) => (
              <PipelineTemplateCard
                key={entry.category.id}
                entry={entry}
                onOpen={openTemplate}
                locked={isLocked(entry)}
                lockedLabel={t("processor.policies.card.requiresAiEngine")}
              />
            ))}
          </CardRail>
        </section>
      )}

      <PolicySetupWizard
        entry={wizard}
        canManagePolicies={canManagePolicies}
        permissionsLoading={permissionsLoading}
        onClose={() => setWizard(null)}
        onSubmit={handleSubmit}
        onCustomise={handleCustomise}
      />
    </div>
  );
}
