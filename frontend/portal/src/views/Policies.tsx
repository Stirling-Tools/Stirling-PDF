import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Banner, Button, Skeleton } from "@shared/components";
import { errorMessage } from "@portal/api/http";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  buildWireFromSetup,
  buildWireFromState,
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

  const catalogue = data?.catalogue ?? [];
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

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

  function handleEdit() {
    if (detail) {
      setWizard(detail);
      setDetail(null);
    }
  }

  return (
    <div className="portal-policies">
      <header className="portal-policies__head">
        <h1 className="portal-policies__title">{t("policies.title")}</h1>
        <p className="portal-policies__sub">{t("policies.subtitle")}</p>
      </header>

      {pageError && <Banner tone="danger" description={pageError} />}

      <CatalogueSummary data={data} loading={loading} />

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
          title={t("policies.offline.title")}
          description={t("policies.offline.description")}
          action={
            <Button variant="outline" size="sm" onClick={refetch}>
              {t("policies.offline.retry")}
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
      />

      <PolicySetupWizard
        entry={wizard}
        onClose={() => setWizard(null)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
