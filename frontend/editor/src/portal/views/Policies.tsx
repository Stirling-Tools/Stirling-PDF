import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton } from "@app/ui";
import { errorMessage } from "@portal/api/http";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  buildWireFromSetup,
  buildWireFromState,
  clearProcessedHistory,
  deletePolicy,
  fetchPolicies,
  savePolicy,
  POLICY_CATEGORIES,
  POLICY_CONFIG,
  type CatalogueEntry,
  type PoliciesResponse,
  type PolicySetupResult,
} from "@portal/api/policies";
import { CatalogueSummary } from "@portal/components/policies/CatalogueSummary";
import { PolicyCategoryCard } from "@portal/components/policies/PolicyCategoryCard";
import { PolicyDetailPanel } from "@portal/components/policies/PolicyDetailPanel";
import { PolicySetupWizard } from "@portal/components/policies/PolicySetupWizard";
import "@portal/views/Policies.css";

export function Policies() {
  const { t } = useTranslation();
  const [version, setVersion] = useState(0);
  const state = useAsync<PoliciesResponse>(() => fetchPolicies(), [version]);
  const { data, loading, error: fetchError } = state;
  const { isLoading } = useSectionFlags(state);

  const [detail, setDetail] = useState<CatalogueEntry | null>(null);
  const [wizard, setWizard] = useState<CatalogueEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const setupId = searchParams.get("setup");
    if (!setupId || !data) return;
    const entry = data.catalogue.find((e) => e.category.id === setupId);
    if (entry && !entry.category.comingSoon) {
      if (entry.policy) setDetail(entry);
      else setWizard(entry);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("setup");
    setSearchParams(next, { replace: true });
  }, [searchParams, data, setSearchParams]);

  const catalogue = data?.catalogue ?? [];
  const refetch = useCallback(() => setVersion((v) => v + 1), []);
  // The catalogue cards are always shown (they're the "configure a policy" CTAs),
  // but the summary strip is pure stat boxes: hide it until at least one policy
  // is configured so a fresh workspace doesn't show a row of zeros.
  const hasPolicies = !!data && data.summary.active + data.summary.paused > 0;

  const displayCatalogue: CatalogueEntry[] =
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
        }));

  function openEntry(entry: CatalogueEntry) {
    if (entry.policy) setDetail(entry);
    else setWizard(entry);
  }

  async function handleSubmit(
    entry: CatalogueEntry,
    result: PolicySetupResult,
  ) {
    setPageError(null);
    try {
      await savePolicy(buildWireFromSetup(entry, result));
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
      savePolicy(buildWireFromState(entry, policy, enabled)),
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
        <div className="portal-policies__grid">
          {displayCatalogue.map((entry) => (
            <PolicyCategoryCard
              key={entry.category.id}
              entry={entry}
              onOpen={openEntry}
            />
          ))}
        </div>
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
