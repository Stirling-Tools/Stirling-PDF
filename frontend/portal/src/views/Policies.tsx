import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@shared/components";
import { useAsync, useSectionFlags } from "@portal/hooks/useAsync";
import {
  deletePolicy,
  fetchPolicies,
  runPolicy,
  savePolicy,
  type CatalogueEntry,
  type PoliciesResponse,
  type Policy,
  type PolicySetupResult,
} from "@portal/api/policies";
import { CatalogueSummary } from "@portal/components/policies/CatalogueSummary";
import { PolicyCategoryCard } from "@portal/components/policies/PolicyCategoryCard";
import { PolicyDetailPanel } from "@portal/components/policies/PolicyDetailPanel";
import { PolicySetupWizard } from "@portal/components/policies/PolicySetupWizard";
import "@portal/views/Policies.css";

/**
 * Translate the setup flow's collected result into the backend `Policy` wire
 * record (Policy.java): the tool chain becomes the ordered pipeline `steps`,
 * the run event becomes the `trigger`, and the output settings become `output`.
 * Reuses the existing record's id on edit so the POST updates in place.
 */
function toWirePolicy(
  entry: CatalogueEntry,
  result: PolicySetupResult,
): Policy {
  return {
    id: entry.policy?.state.backendId ?? "",
    name: `${entry.category.label} Policy`,
    enabled: entry.policy ? entry.policy.state.status !== "paused" : true,
    trigger: { event: result.runOn },
    sources: result.sources.map((source) => ({ source })),
    steps: result.steps,
    output: {
      mode: result.outputMode,
      name: result.outputName,
      namePosition: result.outputNamePosition,
    },
    categoryId: entry.category.id,
  };
}

export function Policies() {
  const { t } = useTranslation();
  // The catalogue is refetched after every mutation by bumping this counter,
  // so the cards/detail reflect the in-memory store the handlers maintain.
  const [version, setVersion] = useState(0);
  const state = useAsync<PoliciesResponse>(() => fetchPolicies(), [version]);
  const { data, loading } = state;
  const { isLoading } = useSectionFlags(state);

  // The category whose detail panel is open (configured), and the one whose
  // setup wizard is open. Both reference a catalogue entry.
  const [detail, setDetail] = useState<CatalogueEntry | null>(null);
  const [wizard, setWizard] = useState<CatalogueEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const catalogue = data?.catalogue ?? [];
  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  // Open the detail panel for configured categories, the wizard otherwise.
  function openEntry(entry: CatalogueEntry) {
    if (entry.policy) setDetail(entry);
    else setWizard(entry);
  }

  async function handleSubmit(
    entry: CatalogueEntry,
    result: PolicySetupResult,
  ) {
    await savePolicy(toWirePolicy(entry, result));
    setWizard(null);
    setDetail(null);
    refetch();
  }

  async function runLifecycle(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setDetail(null);
      refetch();
    } finally {
      setBusy(false);
    }
  }

  function handleRun() {
    const id = detail?.policy?.state.backendId;
    if (id) void runLifecycle(() => runPolicy(id));
  }

  function handleTogglePause() {
    const entry = detail;
    const policy = entry?.policy;
    if (!entry || !policy?.state.backendId) return;
    // Pause/resume is a re-save with the enabled flag flipped (the backend has
    // no dedicated endpoint — every mutation routes through POST /policies).
    void runLifecycle(() =>
      savePolicy({
        id: policy.state.backendId!,
        name: `${entry.category.label} Policy`,
        enabled: policy.state.status === "paused",
        trigger: { event: policy.state.runOn ?? "upload" },
        sources: policy.state.sources.map((source) => ({ source })),
        steps: policy.steps,
        output: {
          mode: policy.state.outputMode ?? "new_version",
          name: policy.state.outputName ?? "",
          namePosition: "suffix",
        },
        categoryId: entry.category.id,
      }),
    );
  }

  function handleDelete() {
    const id = detail?.policy?.state.backendId;
    if (id) void runLifecycle(() => deletePolicy(id));
  }

  // Reopen the wizard for the policy currently shown in the detail panel.
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

      <CatalogueSummary data={data} loading={loading} />

      {isLoading && (
        <div className="portal-policies__grid" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height="11rem" />
          ))}
        </div>
      )}

      {!isLoading && catalogue.length > 0 && (
        <div className="portal-policies__grid">
          {catalogue.map((entry) => (
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
        onRun={handleRun}
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
