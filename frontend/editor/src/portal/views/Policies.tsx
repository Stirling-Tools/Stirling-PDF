import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { useSectionFlags } from "@portal/hooks/useAsync";
import {
  buildWireFromSetup,
  buildWireFromState,
  clearProcessedHistory,
  deletePolicy,
  savePolicy,
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type PolicySetupResult,
} from "@portal/api/policies";
import { usePoliciesOverview } from "@portal/queries/policies";
import { qk } from "@portal/queries/keys";
import { CatalogueSummary } from "@portal/components/policies/CatalogueSummary";
import { PolicyCatalogueTable } from "@portal/components/policies/PolicyCatalogueTable";
import { PolicyDetailPanel } from "@portal/components/policies/PolicyDetailPanel";
import { PolicySetupWizard } from "@portal/components/policies/PolicySetupWizard";
import { useAiEngineEnabled } from "@portal/hooks/useAiEngineEnabled";
import { useConnectGate } from "@portal/hooks/useConnectGate";
import "@portal/views/Policies.css";

export function Policies() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { gated, connect } = useConnectGate();
  const state = usePoliciesOverview();
  const { data, loading, error: fetchError } = state;
  const { isLoading } = useSectionFlags(state);

  const [detail, setDetail] = useState<CatalogueEntry | null>(null);
  const [wizard, setWizard] = useState<CatalogueEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Held in a ref so the effects below do not re-run on its identity. They write back to the URL,
  // so a callback that changes each render would loop: strip the param, re-render, run again.
  const connectRef = useRef(connect);
  connectRef.current = connect;

  // Deep link from the Home processor flow. It sets the wizard directly rather than going through
  // openEntry, so the gate belongs here too: guarding openEntry alone would leave ?setup= as a way
  // past it.
  useEffect(() => {
    const setupId = searchParams.get("setup");
    if (!setupId || !data) return;
    const entry = data.catalogue.find((e) => e.category.id === setupId);
    if (entry && !entry.category.comingSoon) {
      if (gated) connectRef.current();
      else if (entry.policy) setDetail(entry);
      else setWizard(entry);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    setSearchParams(next, { replace: true });
  }, [searchParams, data, setSearchParams, gated]);

  const { enabled: aiEngineEnabled, loading: aiEngineLoading } =
    useAiEngineEnabled();

  const isLocked = useCallback(
    (entry: CatalogueEntry): boolean =>
      entry.category.requiresAiEngine === true &&
      !aiEngineEnabled &&
      !aiEngineLoading &&
      !entry.policy,
    [aiEngineEnabled, aiEngineLoading],
  );

  const catalogue = data?.catalogue ?? [];
  // Invalidate the shared policies caches; because ProcessorFlow and onboarding
  // read the SAME entries, this also live-refreshes Home.
  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.policiesList() });
    queryClient.invalidateQueries({ queryKey: qk.policyRuns() });
  }, [queryClient]);
  // The catalogue cards are always shown (they're the "configure a policy" CTAs),
  // but the summary strip is pure stat boxes: hide it until at least one policy
  // is configured so a fresh workspace doesn't show a row of zeros.
  const hasPolicies = !!data && data.summary.active + data.summary.paused > 0;

  const displayCatalogue: CatalogueEntry[] = useMemo(
    () =>
      catalogue.length > 0
        ? catalogue
        : POLICY_CATEGORIES.map((cat) => ({
            category: cat,
            config: POLICY_CONFIG[cat.id] ?? {
              summary: "",
              rules: [],
              scopeLabel: "",
              fields: [],
              defaultOperations: [],
            },
            policy: null,
          })),
    [catalogue],
  );

  const openEntry = useCallback(
    (entry: CatalogueEntry) => {
      // Ask rather than open an editor whose save would fail; viewing the catalogue stays open.
      // Via the ref so this keeps its identity: the deep-link effect depends on it and writes the
      // URL back, which would otherwise loop.
      if (gated) {
        connectRef.current();
        return;
      }
      // Block setup of an AI-required policy until the engine is confirmed on (so a
      // click during the app-config load can't open a wizard for a disabled
      // feature); a configured policy stays openable so it can be paused/deleted.
      if (entry.category.requiresAiEngine && !aiEngineEnabled && !entry.policy)
        return;
      if (entry.policy) setDetail(entry);
      else setWizard(entry);
    },
    [aiEngineEnabled, gated],
  );

  // Open a category passed as ?category=<id> (deep link from the super
  // search), then strip the param so back/reload doesn't re-open it. Waits for
  // the AI-engine flag too: openEntry refuses AI-gated categories until the
  // flag is confirmed, and stripping the param before that decision would
  // drop the deep link silently.
  useEffect(() => {
    const categoryId = searchParams.get("category");
    if (categoryId === null || loading || aiEngineLoading) return;
    const entry = displayCatalogue.find((e) => e.category.id === categoryId);
    if (entry) openEntry(entry);
    const next = new URLSearchParams(searchParams);
    next.delete("category");
    setSearchParams(next, { replace: true });
  }, [
    searchParams,
    setSearchParams,
    loading,
    aiEngineLoading,
    displayCatalogue,
    openEntry,
  ]);

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
    <div className="portal-policies">
      <header className="portal-policies__head">
        <h1 className="portal-policies__title">{t("portal.policies.title")}</h1>
        <p className="portal-policies__sub">{t("portal.policies.subtitle")}</p>
      </header>

      {pageError && <Banner tone="danger" description={pageError} />}

      {hasPolicies && <CatalogueSummary data={data} loading={loading} />}

      {isLoading && (
        <div className="portal-policies__grid" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="3.5rem" />
          ))}
        </div>
      )}

      {!isLoading && fetchError && (
        <Banner
          tone="warning"
          title={t("portal.policies.offline.title")}
          description={t("portal.policies.offline.description")}
          action={
            <Button variant="secondary" size="sm" onClick={refetch}>
              {t("portal.policies.offline.retry")}
            </Button>
          }
        />
      )}

      {!isLoading && !fetchError && (
        <PolicyCatalogueTable
          entries={displayCatalogue}
          onOpen={openEntry}
          isLocked={isLocked}
          lockedLabel={t("portal.policies.card.requiresAiEngine")}
        />
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
      />
    </div>
  );
}
